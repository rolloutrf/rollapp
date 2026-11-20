import Foundation

enum RollappURL {
    enum Destination {
        case embedded, external, unsupported
    }

    private static let host = "xn--80avakiab.xn--p1ai"
    static let home = URL(string: "https://\(host)/вишлист")!

    private static let yandexAuthHosts: Set<String> = [
        "oauth.yandex.ru", "oauth.yandex.com", "passport.yandex.ru", "passport.yandex.com"
    ]
    private static let externalSchemes: Set<String> = ["mailto", "tel", "sms", "tg", "ton"]

    static func destination(for url: URL) -> Destination {
        guard url.user == nil, url.password == nil,
              let scheme = url.scheme?.lowercased() else { return .unsupported }
        if scheme == "https", let host = url.host?.lowercased(), url.port == nil || url.port == 443,
           host == Self.host || yandexAuthHosts.contains(host) {
            return .embedded
        }
        if (scheme == "https" || scheme == "http"), url.host != nil { return .external }
        return externalSchemes.contains(scheme) ? .external : .unsupported
    }

    static func isPage(_ url: URL) -> Bool {
        destination(for: url) == .embedded && url.host?.lowercased() == host &&
            url.path != "/api" && !url.path.hasPrefix("/api/")
    }
}
