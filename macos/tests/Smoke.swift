import AppKit
import WebKit

@main
@MainActor
struct Smoke {
    static func main() {
        let app = NSApplication.shared
        app.setActivationPolicy(.accessory)
        Task {
            do {
                try await run()
                exit(EXIT_SUCCESS)
            } catch {
                fputs("macOS smoke failed: \(error)\n", stderr)
                exit(EXIT_FAILURE)
            }
        }
        app.run()
    }

    static func run() async throws {
        try require(RollappNavigation.isRollapp(URL(string: "https://роллапп.рф/app")!), "Canonical IDN")
        try require(RollappNavigation.isRollappBlob(URL(string: "blob:https://xn--80avakiab.xn--p1ai/example")!), "Same-origin blob")
        for value in ["http://xn--80avakiab.xn--p1ai", "https://xn--80avakiab.xn--p1ai:444",
                      "https://xn--80avakiab.xn--p1ai.example.org", "https://name@xn--80avakiab.xn--p1ai",
                      "https://other.xn--80avakiab.xn--p1ai", "https://xn--b1amal5ag2b.xn--80avakiab.xn--p1ai.example.org"] {
            try require(!RollappNavigation.isRollapp(URL(string: value)!), "Outside Rollapp origin")
        }
        try require(!RollappNavigation.isYandex(URL(string: "https://passport.yandex.ru.example.org")!), "Outside Yandex origin")
        try require(!RollappNavigation.canOpenExternally(URL(string: "file:///tmp/example")!), "Local file must stay closed")

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        let browser = BrowserWindow(configuration: configuration, downloads: Downloads(), authenticating: true)
        browser.show()

        // A public provider URL exercises WebKit redirects without starting a Rollapp OAuth attempt.
        browser.webView.load(URLRequest(url: URL(string: "https://oauth.yandex.ru/authorize")!))
        try await wait("Yandex ID view") { browser.window.title.hasSuffix("passport.yandex.ru") }
        browser.goHome()
        try await wait("Rollapp sign-in view") { await hasSignIn(browser.webView) }
        browser.webView.goBack()
        try await wait("Back to an existing Yandex ID history item") { browser.window.title.hasSuffix("passport.yandex.ru") }
        browser.webView.goForward()
        try await wait("Forward to Rollapp") { await hasSignIn(browser.webView) }
        print("PASS WebKit redirects, Yandex host title and back/forward history")

        // An unauthenticated visit crosses to the sphere and back to platform sign-in.
        let sphereRoutes = [("вишлист", "xn--b1amal5ag2b"), ("идентичность", "xn--d1achcybhyfe5cwd"),
                            ("здоровье", "xn--b1adef0ban2h"), ("карьера", "xn--80aaos5ab6f"),
                            ("образование", "xn--80aabfqjj3bddt")]
        let platform = RollappNavigation.home.host!
        for (path, subdomain) in sphereRoutes {
            let sphere = "\(subdomain).\(platform)"
            var visitedSphere = false
            let observation = browser.webView.observe(\.url, options: [.new]) { view, _ in
                if view.url?.host == sphere { visitedSphere = true }
            }
            defer { observation.invalidate() }
            browser.webView.load(URLRequest(url: URL(string: "https://\(platform)/\(path)")!))
            try await wait("Platform → \(path) → Rollapp sign-in") {
                guard visitedSphere, browser.webView.url?.host == platform else { return false }
                return await hasSignIn(browser.webView)
            }
            print("PASS platform → \(path) → Rollapp sign-in in the same WebKit window")
        }

        for (width, height) in [(320, 844), (390, 844), (390, 400), (768, 844), (820, 844),
                                (1024, 768), (1440, 844), (1920, 844)] {
            browser.window.setContentSize(NSSize(width: width, height: height))
            try await wait("Sign-in layout at \(width)×\(height)") {
                await pageCheck(browser.webView, """
                    (() => {
                      const link = document.querySelector('a[href*="/api/auth/yandex/start"]');
                      if (!link || innerWidth !== \(width) || innerHeight !== \(height)) return false;
                      const box = link.getBoundingClientRect();
                      return document.documentElement.scrollWidth <= innerWidth &&
                        box.left >= 0 && box.right <= innerWidth && box.height >= 48 &&
                        box.bottom + scrollY <= document.documentElement.scrollHeight;
                    })()
                    """)
            }
            print("PASS \(width)×\(height) Rollapp sign-in and action reachability")
        }

        browser.webView(browser.webView, didFailProvisionalNavigation: nil, withError: URLError(.notConnectedToInternet))
        try require(browser.webView.isHidden, "Network error should show the native recovery view")
        browser.reload()
        try await wait("Retry Rollapp after a network error") {
            guard !browser.webView.isHidden, !browser.webView.isLoading else { return false }
            return await hasSignIn(browser.webView)
        }
        print("PASS recovery view after a simulated network error and live retry")
    }

    private static func hasSignIn(_ webView: WKWebView) async -> Bool {
        guard let url = webView.url, RollappNavigation.isRollapp(url) else { return false }
        return await pageCheck(webView, "Boolean(document.querySelector('a[href*=\"/api/auth/yandex/start\"]'))")
    }

    private static func pageCheck(_ webView: WKWebView, _ script: String) async -> Bool {
        (try? await webView.evaluateJavaScript(script)) as? Bool == true
    }

    private static func wait(_ label: String, until check: () async -> Bool) async throws {
        for _ in 0..<120 {
            if await check() { return }
            try await Task.sleep(nanoseconds: 250_000_000)
        }
        throw Failure(description: label)
    }

    private static func require(_ condition: Bool, _ label: String) throws {
        if !condition { throw Failure(description: label) }
    }

    private struct Failure: Error, CustomStringConvertible {
        let description: String
    }
}
