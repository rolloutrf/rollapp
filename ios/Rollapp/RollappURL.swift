import Foundation

enum RollappURL {
    static let host = "xn--80avakiab.xn--p1ai"
    static let origin = URL(string: "https://\(host)")!
    static let home = origin.appending(path: "вишлист")

    static func page(_ path: String) -> URL { origin.appending(path: path) }

    static func sectionEntry(_ url: URL) -> URL {
        guard isFirstParty(url), let route = URLComponents(url: url, resolvingAgainstBaseURL: false),
              route.path.hasPrefix("/app/spheres/") || route.path == "/app/store" ||
                  route.path == "/app/wishes" || route.path.hasPrefix("/app/wishes/") else { return url }
        let next = route.percentEncodedPath + (route.percentEncodedQuery.map { "?" + $0 } ?? "")
        return addingQuery([.init(name: "next", value: next)], to: page("api/auth/sphere-session")) ?? url
    }

    static func addingQuery(_ items: [URLQueryItem], to url: URL) -> URL? {
        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        components.queryItems = items
        // Express interprets unescaped plus signs as spaces in query strings.
        components.percentEncodedQuery = components.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B")
        return components.url
    }

    static func link(_ value: String?, allowHTTP: Bool = false) -> URL? {
        guard let value = value?.nonempty, (!allowHTTP || URLComponents(string: value)?.scheme != nil),
              let url = URL(string: value, relativeTo: origin)?.absoluteURL,
              url.host != nil, url.user == nil, url.password == nil,
              url.scheme == "https" || (allowHTTP && url.scheme == "http") else { return nil }
        return url
    }
    private static let signInMarker = URLQueryItem(name: "rollapp_ios", value: "sign-in")
    private static let signInReturn = origin.appending(path: "api/healthz").appending(queryItems: [signInMarker])
    static let signIn = origin.appending(path: "api/auth/yandex/start").appending(queryItems: [
        URLQueryItem(name: "next", value: signInReturn.path + "?" + signInMarker.name + "=sign-in")
    ])

    private static let yandexAuthHosts: Set<String> = [
        "oauth.yandex.ru", "oauth.yandex.com", "passport.yandex.ru", "passport.yandex.com"
    ]
    private static let sphereHosts: Set<String> = [
        "xn--d1achcybhyfe5cwd", "xn--b1adef0ban2h", "xn--80aaos5ab6f", "xn--80aabfqjj3bddt", "xn--b1amal5ag2b"
    ].reduce(into: []) { $0.insert("\($1).\(host)") }

    static func isWebLink(_ url: URL) -> Bool {
        url.user == nil && url.password == nil && url.host?.isEmpty == false &&
            ["http", "https"].contains(url.scheme?.lowercased() ?? "")
    }

    static func isFirstParty(_ url: URL) -> Bool {
        isStandardHTTPS(url) && url.host?.lowercased() == host
    }

    static func isSection(_ url: URL) -> Bool {
        isFirstParty(url) || (isStandardHTTPS(url) && sphereHosts.contains(url.host?.lowercased() ?? ""))
    }

    static func isSignInPage(_ url: URL) -> Bool {
        isFirstParty(url) || (isStandardHTTPS(url) && yandexAuthHosts.contains(url.host?.lowercased() ?? ""))
    }

    private static func isStandardHTTPS(_ url: URL) -> Bool {
        isWebLink(url) && url.scheme?.lowercased() == "https" && (url.port == nil || url.port == 443)
    }

    static func isSignInReturn(_ url: URL) -> Bool {
        isFirstParty(url) && url.path == signInReturn.path &&
            URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.contains(signInMarker) == true
    }

    static func signInProblem(_ url: URL) -> String? {
        guard isFirstParty(url), ["/login", "/вход"].contains(url.path) else { return nil }
        let code = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?
            .first(where: { ["auth_error", "ошибка-входа"].contains($0.name) })?.value
        switch code {
        case "YANDEX_CANCELLED": return "Вход через Яндекс ID отменён."
        case "YANDEX_STATE_INVALID": return "Попытка входа устарела. Начните вход ещё раз."
        case "YANDEX_LINK_REQUIRED", "INVITE_REQUIRED":
            return "Выберите Яндекс ID, который уже подключён к вашему аккаунту Rollapp."
        case "YANDEX_IDENTITY_CONFLICT": return "Этот Яндекс ID привязан к другому аккаунту."
        case "YANDEX_EMAIL_REQUIRED": return "Разрешите Яндексу передать email и попробуйте ещё раз."
        default: return "Яндекс ID не подтвердил вход. Попробуйте ещё раз."
        }
    }

}
