import Foundation

enum RollappNavigation {
    private static let platformHost = "xn--80avakiab.xn--p1ai"
    static let home = URL(string: "https://\(platformHost)/app")!
    private static let rollappHosts: Set<String> = [
        platformHost,
        "xn--b1amal5ag2b.\(platformHost)", // Вишлист
        "xn--d1achcybhyfe5cwd.\(platformHost)", // Идентичность
        "xn--b1adef0ban2h.\(platformHost)", // Здоровье
        "xn--80aaos5ab6f.\(platformHost)", // Карьера
        "xn--80aabfqjj3bddt.\(platformHost)", // Образование
    ]
    private static let yandexHosts: Set<String> = ["oauth.yandex.ru", "passport.yandex.ru"]

    static func isRollapp(_ url: URL) -> Bool {
        isHTTPS(url) && url.host.map { rollappHosts.contains($0.lowercased()) } == true
    }

    static func isYandex(_ url: URL) -> Bool {
        isHTTPS(url) && url.host.map { yandexHosts.contains($0.lowercased()) } == true
    }

    static func startsYandexSignIn(_ url: URL) -> Bool {
        isRollapp(url) && url.path == "/api/auth/yandex/start"
    }

    static func isRollappBlob(_ url: URL) -> Bool {
        guard url.scheme == "blob", let origin = URL(string: String(url.absoluteString.dropFirst(5))) else {
            return false
        }
        return isRollapp(origin)
    }

    static func canOpenExternally(_ url: URL) -> Bool {
        switch url.scheme?.lowercased() {
        case "https", "http": return url.host != nil && url.user == nil && url.password == nil
        case "mailto", "tel", "tg", "ton", "tonkeeper", "tonhub": return true
        default: return false
        }
    }

    private static func isHTTPS(_ url: URL) -> Bool {
        url.scheme?.lowercased() == "https" && (url.port == nil || url.port == 443) &&
            url.user == nil && url.password == nil
    }
}
