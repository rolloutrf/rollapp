import SwiftUI
import UIKit
import WebKit

@MainActor
final class RollappSession: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate {
    enum Page {
        case signIn
        case section(URL)
        case link(URL)

        var url: URL {
            switch self {
            case .signIn: RollappURL.signIn
            case let .section(url), let .link(url): url
            }
        }

        func allows(_ url: URL) -> Bool {
            switch self {
            case .signIn: RollappURL.isSignInPage(url)
            case .section: RollappURL.isSection(url) || RollappURL.isSignInPage(url)
            case .link: RollappURL.isWebLink(url)
            }
        }
    }

    enum State: Equatable {
        case loading, ready, verifying, unavailable
    }

    @Published private(set) var state = State.loading
    @Published private(set) var problem: String?
    @Published var linkedPage: InAppPage?
    @Published var linkProblem: String?
    @Published private(set) var canGoBack = false

    let webView: WKWebView
    private let page: Page
    private var requestedURL: URL
    private var currentNavigation: WKNavigation?
    private var hasStarted = false
    private var timeout: Task<Void, Never>?
    private var loaderMonitor: Task<Void, Never>?
    private var history: NSKeyValueObservation?

    init(page: Page = .signIn) {
        self.page = page
        requestedURL = page.url
        let config = WKWebViewConfiguration()
        if case .link = page {
            config.websiteDataStore = .nonPersistent()
        } else {
            config.websiteDataStore = .default()
        }
        config.preferences.javaScriptCanOpenWindowsAutomatically = false

        webView = WKWebView(frame: .zero, configuration: config)
        super.init()

        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.underPageBackgroundColor = UIColor(white: 10.0 / 255, alpha: 1)
        history = webView.observe(\.canGoBack, options: [.new]) { [weak self] _, change in
            guard let canGoBack = change.newValue else { return }
            Task { @MainActor [weak self] in self?.canGoBack = canGoBack }
        }
    }

    func start() {
        guard !hasStarted else { return }
        hasStarted = true
        load()
    }

    func load() {
        let url: URL
        switch page {
        case .signIn: url = page.url
        case .section, .link: url = state == .unavailable ? requestedURL : webView.url ?? requestedURL
        }
        if state == .ready, webView.url == url, let navigation = webView.reload() {
            begin(navigation)
            return
        }
        guard page.allows(url) else {
            showProblem("Этот адрес нельзя открыть в Rollapp.")
            return
        }
        navigate(URLRequest(url: url, cachePolicy: .reloadRevalidatingCacheData, timeoutInterval: 25))
    }

    func goBack() {
        if let navigation = webView.goBack() { begin(navigation) }
    }

    private func navigate(_ request: URLRequest) {
        if let url = request.url { requestedURL = url }
        if let navigation = webView.load(request) { begin(navigation) }
        else { showProblem("Не удалось открыть страницу.") }
    }

    private func begin(_ navigation: WKNavigation) {
        guard currentNavigation !== navigation else { return }
        currentNavigation = navigation
        problem = nil
        if webView.url == nil || state != .ready { state = .loading }
        loaderMonitor?.cancel()
        timeout?.cancel()
        timeout = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(25)) }
            catch { return }
            guard let self, currentNavigation === navigation else { return }
            webView.stopLoading()
            showProblem("Страница не успела загрузиться. Попробуйте ещё раз.")
        }
    }

    private func finish() {
        timeout?.cancel()
        timeout = nil
        currentNavigation = nil
        canGoBack = webView.canGoBack
    }

    private func showProblem(_ message: String) {
        finish()
        loaderMonitor?.cancel()
        problem = message
        state = .unavailable
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        if let navigation { begin(navigation) }
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        guard let navigation, navigation === currentNavigation else { return }
        state = .ready
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let navigation, navigation === currentNavigation else { return }
        finish()
        guard case .section = page else { return }
        let visibilityCheck = """
            (() => {
              const loader = document.querySelector('.page-loader[aria-busy="true"]');
              return loader instanceof HTMLElement && loader.getClientRects().length > 0;
            })()
            """
        loaderMonitor = Task { [weak self] in
            for _ in 0..<13 {
                do { try await Task.sleep(for: .seconds(2)) }
                catch { return }
                guard let self, state == .ready, let url = self.webView.url, RollappURL.isSection(url),
                      (try? await self.webView.evaluateJavaScript(visibilityCheck)) as? Bool == true,
                      !Task.isCancelled else { return }
            }
            self?.showProblem("Rollapp не успел загрузить данные. Попробуйте ещё раз.")
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        fail(navigation, error: error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        fail(navigation, error: error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        showProblem("Страница перестала отвечать. Попробуйте открыть её снова.")
    }

    private func fail(_ navigation: WKNavigation?, error: Error) {
        let nsError = error as NSError
        guard let navigation, navigation === currentNavigation else { return }
        if nsError.domain == NSURLErrorDomain, nsError.code == NSURLErrorCancelled { return }
        showProblem(RollappAPIError.connectionError(error).localizedDescription)
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let target = action.targetFrame, target.isMainFrame else {
            decisionHandler(.allow)
            return
        }
        guard let url = action.request.url else {
            decisionHandler(.cancel)
            return
        }
        if case .signIn = page, let message = RollappURL.signInProblem(url) {
            decisionHandler(.cancel)
            showProblem(message)
            return
        }
        let allowed = page.allows(url)
        if allowed, action.request.httpMethod == "GET" { requestedURL = url }
        decisionHandler(allowed ? .allow : .cancel)
        if !allowed { handleLink(action) }
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        guard response.isForMainFrame else {
            decisionHandler(.allow)
            return
        }
        guard let url = response.response.url, page.allows(url) else {
            decisionHandler(.cancel)
            showProblem("Страница перенаправила на адрес, который нельзя открыть здесь.")
            return
        }
        if case .signIn = page, let http = response.response as? HTTPURLResponse,
           RollappURL.isSignInReturn(url), (200..<300).contains(http.statusCode) {
            decisionHandler(.cancel)
            finish()
            state = .verifying
            return
        }
        if let http = response.response as? HTTPURLResponse, (400...599).contains(http.statusCode) {
            decisionHandler(.cancel)
            switch http.statusCode {
            case 401, 403: showProblem("Для этой страницы нужен вход или доступ к разделу.")
            case 404: showProblem("Страница не найдена.")
            default: showProblem("Сервер не смог открыть страницу. Попробуйте ещё раз.")
            }
            return
        }
        guard response.canShowMIMEType else {
            decisionHandler(.cancel)
            showProblem("Этот файл нельзя просмотреть в Rollapp.")
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard action.targetFrame == nil, let url = action.request.url else { return nil }
        if page.allows(url) { navigate(action.request) }
        else { handleLink(action) }
        return nil
    }

    private func handleLink(_ action: WKNavigationAction) {
        let userNavigation = action.navigationType == .linkActivated || action.targetFrame == nil
        if case .signIn = page {
            if userNavigation { linkProblem = "Эта ссылка недоступна во время входа." }
            else if state == .loading || currentNavigation != nil { showProblem("Не удалось продолжить вход.") }
        } else if userNavigation, let url = action.request.url, action.request.httpMethod == "GET", RollappURL.isWebLink(url) {
            linkedPage = InAppPage(link: url)
        } else if userNavigation {
            linkProblem = "Этот адрес нельзя открыть в Rollapp."
        } else if state == .loading || currentNavigation != nil {
            showProblem("Этот адрес нельзя открыть в Rollapp.")
        }
    }
}
