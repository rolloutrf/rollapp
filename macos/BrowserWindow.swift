import AppKit
import WebKit

@MainActor
final class BrowserWindow: NSObject, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate {
    let window: NSWindow
    let webView: WKWebView
    var openWindow: ((WKWebViewConfiguration, Bool) -> WKWebView)?
    var onClose: (() -> Void)?

    private let downloads: Downloads
    private let status = NSView()
    private var retryURL = RollappNavigation.home
    private var authenticating: Bool

    init(configuration: WKWebViewConfiguration, downloads: Downloads, authenticating: Bool = false) {
        self.downloads = downloads
        self.authenticating = authenticating
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        webView = WKWebView(frame: .zero, configuration: configuration)
        let screen = NSScreen.main?.visibleFrame.size ?? NSSize(width: 1264, height: 884)
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: min(1200, screen.width - 64), height: min(820, screen.height - 64)),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered, defer: false
        )
        super.init()

        window.title = "Rollapp"
        window.contentMinSize = NSSize(width: 320, height: 300)
        window.collectionBehavior.insert(.fullScreenPrimary)
        window.isReleasedWhenClosed = false
        window.delegate = self
        window.center()

        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        installContent()
        window.initialFirstResponder = webView
    }

    func show() {
        window.makeKeyAndOrderFront(nil)
    }

    func goHome() {
        load(RollappNavigation.home)
    }

    func reload() {
        if status.isHidden, webView.url != nil {
            webView.reload()
        } else {
            retry()
        }
    }

    func openInBrowser() {
        let currentURL = webView.url.flatMap { RollappNavigation.isRollapp($0) ? $0 : nil }
        NSWorkspace.shared.open(currentURL ?? RollappNavigation.home)
    }

    func windowWillClose(_ notification: Notification) {
        onClose?()
    }

    func webView(
        _ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = action.request.url else { return decisionHandler(.cancel) }

        if let frame = action.targetFrame, !frame.isMainFrame {
            let frameSchemes = ["https", "http", "about", "blob", "data"]
            return decisionHandler(frameSchemes.contains(url.scheme ?? "") ? .allow : .cancel)
        }
        if action.targetFrame == nil {
            // WebKit's popup blocker runs before it asks us to create a window.
            guard isTrustedSource(action) else { return decisionHandler(.cancel) }
            if canDisplay(url) && action.shouldPerformDownload { return decisionHandler(.download) }
            return decisionHandler(canDisplay(url) || RollappNavigation.canOpenExternally(url) ? .allow : .cancel)
        }
        // A back/forward item has already passed the policy when it entered WebKit's history.
        if action.navigationType == .backForward, RollappNavigation.isYandex(url) {
            authenticating = true
        }
        if canDisplay(url) {
            if RollappNavigation.startsYandexSignIn(url), isTrustedSource(action) {
                authenticating = true
            } else if RollappNavigation.isRollapp(url), action.request.httpMethod == "GET" {
                retryURL = url
            }
            return decisionHandler(action.shouldPerformDownload ? .download : .allow)
        }

        decisionHandler(.cancel)
        if action.navigationType == .linkActivated, isTrustedSource(action), RollappNavigation.canOpenExternally(url) {
            NSWorkspace.shared.open(url)
        }
    }

    func webView(
        _ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
        decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
    ) {
        guard response.isForMainFrame else { return decisionHandler(.allow) }
        guard let url = response.response.url, canDisplay(url) else { return decisionHandler(.cancel) }
        let http = response.response as? HTTPURLResponse
        if let code = http?.statusCode, (500...599).contains(code) {
            showConnectionError()
            return decisionHandler(.cancel)
        }
        let disposition = http?.value(forHTTPHeaderField: "Content-Disposition")?
            .split(separator: ";", maxSplits: 1).first?.trimmingCharacters(in: .whitespaces).lowercased()
        decisionHandler(response.canShowMIMEType && disposition != "attachment" ? .allow : .download)
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        status.isHidden = true
        webView.isHidden = false
        if let url = webView.url, RollappNavigation.isYandex(url) {
            window.title = "Вход через Яндекс ID · \(url.host ?? "")"
        } else {
            authenticating = false
            window.title = "Rollapp"
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handleNavigationError(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleNavigationError(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        showConnectionError()
    }

    func webView(
        _ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
        for action: WKNavigationAction, windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        guard let url = action.request.url, isTrustedSource(action) else { return nil }
        if canDisplay(url) {
            return openWindow?(configuration, authenticating && RollappNavigation.isYandex(url))
        }
        if RollappNavigation.canOpenExternally(url) {
            NSWorkspace.shared.open(url)
        }
        return nil
    }

    func webViewDidClose(_ webView: WKWebView) {
        if onClose != nil { window.close() }
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        downloads.track(download)
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        downloads.track(download)
    }

    private func isTrustedSource(_ action: WKNavigationAction) -> Bool {
        guard action.sourceFrame.isMainFrame, let source = action.sourceFrame.request.url else { return false }
        return RollappNavigation.isRollapp(source) || (authenticating && RollappNavigation.isYandex(source))
    }

    private func canDisplay(_ url: URL) -> Bool {
        RollappNavigation.isRollapp(url) || RollappNavigation.isRollappBlob(url) ||
            (authenticating && RollappNavigation.isYandex(url))
    }

    private func load(_ url: URL) {
        webView.load(URLRequest(url: url, timeoutInterval: 30))
    }

    private func handleNavigationError(_ error: Error) {
        let failure = error as NSError
        // Superseded navigations and responses intentionally handed to WKDownload.
        if failure.domain == NSURLErrorDomain, failure.code == NSURLErrorCancelled { return }
        if failure.domain == "WebKitErrorDomain", failure.code == 102 { return }
        showConnectionError()
    }

    private func showConnectionError() {
        authenticating = false
        window.title = "Rollapp"
        webView.isHidden = true
        status.isHidden = false
    }

    @objc private func retry() {
        status.isHidden = true
        webView.isHidden = false
        load(retryURL)
    }

    private func installContent() {
        let content = NSView()
        window.contentView = content
        for view in [webView, status] {
            view.translatesAutoresizingMaskIntoConstraints = false
            content.addSubview(view)
            NSLayoutConstraint.activate([
                view.topAnchor.constraint(equalTo: content.topAnchor),
                view.bottomAnchor.constraint(equalTo: content.bottomAnchor),
                view.leadingAnchor.constraint(equalTo: content.leadingAnchor),
                view.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            ])
        }
        status.isHidden = true

        let title = NSTextField(labelWithString: "Не удалось открыть Rollapp")
        title.font = .systemFont(ofSize: 21, weight: .semibold)
        let detail = NSTextField(wrappingLabelWithString: "Проверьте подключение к интернету и попробуйте ещё раз.")
        detail.alignment = .center
        detail.textColor = .secondaryLabelColor
        let button = NSButton(title: "Повторить", target: self, action: #selector(retry))
        button.bezelStyle = .rounded
        button.controlSize = .large

        let stack = NSStackView(views: [title, detail, button])
        stack.orientation = .vertical
        stack.alignment = .centerX
        stack.spacing = 12
        stack.setCustomSpacing(20, after: detail)
        stack.translatesAutoresizingMaskIntoConstraints = false
        status.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: status.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: status.centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: status.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: status.trailingAnchor, constant: -20),
            detail.widthAnchor.constraint(lessThanOrEqualToConstant: 320),
        ])
    }
}
