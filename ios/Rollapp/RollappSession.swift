import SwiftUI
import UIKit
import WebKit

@MainActor
final class RollappSession: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate {
    enum State {
        case loading, ready, unavailable
    }

    @Published private(set) var state = State.loading

    let webView: WKWebView
    private var hasStarted = false
    private var currentNavigation: WKNavigation?
    private var lastPage = RollappURL.home

    override init() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.preferences.javaScriptCanOpenWindowsAutomatically = false

        webView = WKWebView(frame: .zero, configuration: config)
        super.init()

        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        // The responsive site already accounts for the device safe areas in CSS.
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.underPageBackgroundColor = UIColor(white: 10.0 / 255, alpha: 1)
        #if DEBUG
        webView.isInspectable = true
        #endif
    }

    func start() {
        guard !hasStarted else { return }
        hasStarted = true
        load()
    }

    func load() {
        state = .loading
        currentNavigation = webView.load(URLRequest(url: lastPage, timeoutInterval: 30))
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        currentNavigation = navigation
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        guard let navigation, navigation === currentNavigation else { return }
        rememberPage(webView.url)
        state = .ready
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        fail(navigation, error: error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        fail(navigation, error: error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        rememberPage(webView.url)
        currentNavigation = nil
        state = .unavailable
    }

    private func fail(_ navigation: WKNavigation?, error: Error) {
        let error = error as NSError
        guard let navigation, navigation === currentNavigation,
              !(error.domain == NSURLErrorDomain && error.code == NSURLErrorCancelled) else { return }
        rememberPage(error.userInfo[NSURLErrorFailingURLErrorKey] as? URL)
        state = .unavailable
    }

    private func rememberPage(_ url: URL?) {
        guard let url, RollappURL.isPage(url) else { return }
        lastPage = url
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        // WebKit sends a new window to the UI delegate below. Leave subframes to WebKit.
        guard action.targetFrame?.isMainFrame == true else {
            decisionHandler(.allow)
            return
        }
        guard let url = action.request.url else {
            decisionHandler(.cancel)
            return
        }
        let destination = RollappURL.destination(for: url)
        decisionHandler(destination == .embedded ? .allow : .cancel)
        if destination == .external {
            openExternalLink(url, from: action)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        guard response.isForMainFrame, let http = response.response as? HTTPURLResponse,
              (500...599).contains(http.statusCode) else {
            decisionHandler(.allow)
            return
        }
        rememberPage(http.url)
        currentNavigation = nil
        state = .unavailable
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard action.targetFrame == nil, let url = action.request.url else { return nil }
        switch RollappURL.destination(for: url) {
        case .embedded:
            // Reuse the same website data store for login, callbacks and target=_blank links.
            webView.load(action.request)
        case .external:
            openExternalLink(url, from: action)
        case .unsupported:
            break
        }
        return nil
    }

    private func openExternalLink(_ url: URL, from action: WKNavigationAction) {
        guard action.request.httpMethod == "GET",
              action.navigationType == .linkActivated || action.targetFrame == nil else { return }
        UIApplication.shared.open(url)
    }
}
