import Foundation
import SwiftUI
import WebKit

private struct AccountResponse: Decodable {
    let user: RollappAccount?
}

private struct WishResponse: Decodable { let wish: RollappWish }
private struct ListResponse: Decodable { let list: WishListInfo }
private struct WishStatus: Decodable { let status: String }
private struct Fulfillment: Encodable { let fulfilled: Bool }
private struct Success: Decodable { let ok: Bool }
private struct EmptyBody: Encodable {}
private struct PeopleResponse: Decodable { let people: [RollappPerson] }
private struct FollowState: Codable { let following: Bool }

private struct APIErrorResponse: Decodable { let error: String? }

enum RollappAPIError: LocalizedError {
    case signedOut
    case response(Int, String?)
    case invalidResponse
    case unavailable
    case secureConnection

    var errorDescription: String? {
        switch self {
        case .signedOut: "Войдите в Rollapp ещё раз."
        case let .response(_, message): message ?? "Сервер временно недоступен. Попробуйте ещё раз."
        case .invalidResponse: "Сервер вернул неожиданный ответ. Попробуйте ещё раз."
        case .unavailable: "Проверьте подключение к интернету и попробуйте ещё раз."
        case .secureConnection: "Не удалось установить защищённое соединение с сервером Rollapp."
        }
    }

    static func connectionError(_ error: Error) -> Self {
        guard let urlError = error as? URLError else { return .unavailable }
        switch urlError.code {
        case .secureConnectionFailed, .serverCertificateHasBadDate, .serverCertificateUntrusted,
             .serverCertificateHasUnknownRoot, .serverCertificateNotYetValid:
            return .secureConnection
        default:
            return .unavailable
        }
    }
}

private final class DirectResponse: NSObject, URLSessionTaskDelegate, Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

@MainActor
final class RollappAPI {
    static let cookieStore = WKWebsiteDataStore.default().httpCookieStore
    private let session: URLSession

    init() {
        let config = URLSessionConfiguration.ephemeral
        config.httpShouldSetCookies = false
        config.httpCookieStorage = nil
        config.urlCache = nil
        config.timeoutIntervalForRequest = 15
        config.timeoutIntervalForResource = 25
        session = URLSession(configuration: config, delegate: DirectResponse(), delegateQueue: nil)
    }

    func sessionCookie() async -> HTTPCookie? {
        let cookies = await Self.cookieStore.allCookies()
        let firstParty = cookies.filter {
            let domain = $0.domain.hasPrefix(".") ? String($0.domain.dropFirst()) : $0.domain
            return URL(string: "https://\(domain)")?.host()?.lowercased() == RollappURL.host && $0.path == "/" &&
            ($0.expiresDate.map { $0 > Date() } ?? true)
        }
        return firstParty.first { $0.name == "__Secure-rollapp-session" && $0.isSecure } ??
            firstParty.first { $0.name == "rw_session" }
    }

    func account(cookie: HTTPCookie) async throws -> RollappAccount? {
        let result: AccountResponse = try await request("me", cookie: cookie)
        return result.user
    }

    func wishlist(cookie: HTTPCookie, accountID: String) async throws -> WishBoard {
        try await request("dashboard", cookie: cookie, accountID: accountID)
    }

    func people(scope: FriendScope, search: String, cookie: HTTPCookie, accountID: String) async throws -> [RollappPerson] {
        let result: PeopleResponse = try await request("people", query: [
            URLQueryItem(name: "scope", value: scope.rawValue),
            URLQueryItem(name: "search", value: search)
        ], cookie: cookie, accountID: accountID)
        return result.people
    }

    func publicProfile(address: String, cookie: HTTPCookie, accountID: String) async throws -> RollappPublicProfile {
        try await request("profile", segment: address, cookie: cookie, accountID: accountID)
    }

    func setFollowing(_ following: Bool, address: String, cookie: HTTPCookie, accountID: String) async throws {
        let _: FollowState = try await request("profile", segment: address, suffix: "follow", method: "POST",
            body: JSONEncoder().encode(FollowState(following: following)), cookie: cookie, accountID: accountID)
    }

    func saveWish(_ draft: WishDraft, id: String?, cookie: HTTPCookie, accountID: String) async throws -> RollappWish {
        let result: WishResponse = try await request(id.map { "wishes/" + $0 } ?? "wishes",
            method: id == nil ? "POST" : "PATCH", body: JSONEncoder().encode(draft),
            cookie: cookie, accountID: accountID)
        return result.wish
    }

    func saveList(_ draft: WishListDraft, id: String?, cookie: HTTPCookie, accountID: String) async throws -> WishListInfo {
        let result: ListResponse = try await request(id.map { "lists/" + $0 } ?? "lists",
            method: id == nil ? "POST" : "PATCH", body: JSONEncoder().encode(draft),
            cookie: cookie, accountID: accountID)
        return result.list
    }

    func fulfill(_ wish: RollappWish, cookie: HTTPCookie, accountID: String) async throws -> String {
        let result: WishStatus = try await request("wishes/\(wish.id)/fulfilled", method: "POST",
            body: JSONEncoder().encode(Fulfillment(fulfilled: !wish.isFulfilled)), cookie: cookie, accountID: accountID)
        return result.status
    }

    func deleteWish(_ id: String, cookie: HTTPCookie, accountID: String) async throws {
        let _: Success = try await request("wishes/" + id, method: "DELETE", cookie: cookie, accountID: accountID)
    }

    func signOut(cookie: HTTPCookie, accountID: String) async throws {
        let _: Success = try await request("auth/logout", method: "POST", body: JSONEncoder().encode(EmptyBody()),
                                            cookie: cookie, accountID: accountID)
        if await sessionCookie()?.value == cookie.value {
            await Self.cookieStore.deleteCookie(cookie)
        }
    }

    private func request<T: Decodable>(_ path: String, segment: String? = nil, suffix: String? = nil,
                                       query: [URLQueryItem] = [], method: String = "GET", body: Data? = nil,
                                       cookie: HTTPCookie, accountID: String? = nil) async throws -> T {
        var url = RollappURL.page("api/" + path)
        if let segment { url = url.appending(component: segment) }
        if let suffix { url = url.appending(component: suffix) }
        if !query.isEmpty {
            guard let queriedURL = RollappURL.addingQuery(query, to: url) else { throw RollappAPIError.invalidResponse }
            url = queriedURL
        }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
        request.httpMethod = method
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        if method != "GET" { request.setValue(RollappURL.origin.absoluteString, forHTTPHeaderField: "Origin") }
        if let accountID { request.setValue(accountID, forHTTPHeaderField: "X-Rollapp-Account") }
        for (key, value) in HTTPCookie.requestHeaderFields(with: [cookie]) {
            request.setValue(value, forHTTPHeaderField: key)
        }

        let result: (Data, URLResponse)
        do {
            result = try await session.data(for: request)
        } catch let error as URLError where error.code == .cancelled {
            throw CancellationError()
        } catch {
            throw RollappAPIError.connectionError(error)
        }
        guard let response = result.1 as? HTTPURLResponse else { throw RollappAPIError.invalidResponse }
        if response.statusCode == 401 { throw RollappAPIError.signedOut }
        let decoder = JSONDecoder()
        guard (200..<300).contains(response.statusCode) else {
            let error = try? decoder.decode(APIErrorResponse.self, from: result.0)
            throw RollappAPIError.response(response.statusCode, error?.error)
        }
        guard let data = try? decoder.decode(T.self, from: result.0) else {
            throw RollappAPIError.invalidResponse
        }
        return data
    }
}

@MainActor
final class RollappStore: NSObject, ObservableObject, WKHTTPCookieStoreObserver {
    enum Session {
        case checking, signedOut, signedIn(RollappAccount), failed(String)
    }

    @Published private(set) var session = Session.checking
    @Published private(set) var isRefreshing = false

    @Published private(set) var board: WishBoard?
    @Published private(set) var boardError: String?
    @Published private(set) var isSaving = false

    private let api = RollappAPI()
    private var observedCookie: HTTPCookie?
    private var needsRefresh = false

    override init() {
        super.init()
        RollappAPI.cookieStore.add(self)
    }

    isolated deinit {
        RollappAPI.cookieStore.remove(self)
    }

    func cookiesDidChange(in cookieStore: WKHTTPCookieStore) {
        // Other sign-in cookies can change throughout OAuth. Refresh only when the app session changes.
        Task { [weak self] in
            guard let self else { return }
            let cookie = await api.sessionCookie()
            guard !Task.isCancelled, cookie?.value != observedCookie?.value else { return }
            await refresh()
        }
    }

    func refresh() async {
        guard !isRefreshing, !isSaving else {
            needsRefresh = true
            return
        }
        isRefreshing = true
        defer { isRefreshing = false }

        repeat {
            needsRefresh = false
            await checkSession()
        } while needsRefresh && !Task.isCancelled
    }

    private func checkSession() async {
        do {
            let cookie = await api.sessionCookie()
            try Task.checkCancellation()
            guard let cookie, let account = try await api.account(cookie: cookie) else {
                clear()
                return
            }
            try Task.checkCancellation()
            guard await api.sessionCookie()?.value == cookie.value else {
                needsRefresh = true
                return
            }
            observedCookie = cookie
            if case let .signedIn(previous) = session, previous.id != account.id {
                board = nil
                boardError = nil
            }
            session = .signedIn(account)
            let loaded = try await api.wishlist(cookie: cookie, accountID: account.id)
            try Task.checkCancellation()
            guard await api.sessionCookie()?.value == cookie.value else {
                needsRefresh = true
                return
            }
            board = loaded
            boardError = nil
        } catch is CancellationError {
            return
        } catch RollappAPIError.signedOut {
            clear()
        } catch {
            if case .signedIn = session {
                boardError = error.localizedDescription
            } else {
                session = .failed(error.localizedDescription)
            }
        }
    }

    func people(scope: FriendScope, search: String) async throws -> [RollappPerson] {
        try await read { cookie, account in
            try await api.people(scope: scope, search: search, cookie: cookie, accountID: account.id)
        }
    }

    func publicProfile(address: String) async throws -> RollappPublicProfile {
        try await read { cookie, account in
            try await api.publicProfile(address: address, cookie: cookie, accountID: account.id)
        }
    }

    func setFollowing(_ following: Bool, address: String) async throws {
        try await mutate { cookie, account in
            try await api.setFollowing(following, address: address, cookie: cookie, accountID: account.id)
        }
    }

    private func read<T>(_ action: (HTTPCookie, RollappAccount) async throws -> T) async throws -> T {
        guard case let .signedIn(account) = session, let cookie = observedCookie else {
            throw RollappAPIError.signedOut
        }
        guard await api.sessionCookie()?.value == cookie.value else {
            await refresh()
            throw RollappAPIError.signedOut
        }
        let value = try await action(cookie, account)
        try Task.checkCancellation()
        guard await api.sessionCookie()?.value == cookie.value else {
            await refresh()
            throw RollappAPIError.signedOut
        }
        return value
    }

    func saveWish(_ draft: WishDraft, id: String?) async throws {
        try await mutate { cookie, account in
            let wish = try await api.saveWish(draft, id: id, cookie: cookie, accountID: account.id)
            if let index = board?.wishes.firstIndex(where: { $0.id == wish.id }) {
                board?.wishes[index] = wish
            } else {
                board?.wishes.insert(wish, at: 0)
            }
        }
    }

    func saveList(_ draft: WishListDraft, id: String?) async throws -> WishListInfo {
        try await mutate { cookie, account in
            let list = try await api.saveList(draft, id: id, cookie: cookie, accountID: account.id)
            if let index = board?.lists.firstIndex(where: { $0.id == list.id }) {
                board?.lists[index] = list
            } else {
                board?.lists.append(list)
            }
            return list
        }
    }

    func fulfill(_ wish: RollappWish) async throws {
        try await mutate { cookie, account in
            let status = try await api.fulfill(wish, cookie: cookie, accountID: account.id)
            if let index = board?.wishes.firstIndex(where: { $0.id == wish.id }) {
                board?.wishes[index].status = status
            }
        }
    }

    func deleteWish(_ id: String) async throws {
        try await mutate { cookie, account in
            try await api.deleteWish(id, cookie: cookie, accountID: account.id)
            board?.wishes.removeAll { $0.id == id }
        }
    }

    func signOut() async throws {
        try await mutate { cookie, account in
            try await api.signOut(cookie: cookie, accountID: account.id)
            clear()
        }
    }

    private func mutate<T>(_ action: (HTTPCookie, RollappAccount) async throws -> T) async throws -> T {
        guard !isSaving, !isRefreshing else {
            throw RollappAPIError.response(0, "Дождитесь окончания обновления.")
        }
        guard case let .signedIn(account) = session else { throw RollappAPIError.signedOut }
        isSaving = true
        defer {
            isSaving = false
            if needsRefresh { Task { await refresh() } }
        }
        guard let cookie = await api.sessionCookie(), cookie.value == observedCookie?.value else {
            needsRefresh = true
            throw RollappAPIError.response(409, "Сессия изменилась. Попробуйте ещё раз.")
        }
        do {
            return try await action(cookie, account)
        } catch RollappAPIError.signedOut {
            clear()
            throw RollappAPIError.signedOut
        }
    }

    private func clear() {
        observedCookie = nil
        board = nil
        boardError = nil
        session = .signedOut
    }
}
