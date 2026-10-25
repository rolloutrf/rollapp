import SwiftUI
import EventKit
import Security
import Combine
#if os(macOS)
import AppKit
#else
import UIKit
#endif

enum BridgeError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let value) = self { return value }; return nil }
}

struct Connection: Codable, Equatable {
    let server: URL
    let token: String
    let title: String
    static func parse(_ value: String) throws -> Connection {
        guard let parts = URLComponents(string: value.trimmingCharacters(in: .whitespacesAndNewlines)), parts.scheme == "rollapp-calendar", parts.host == "connect" else { throw BridgeError.message("Скопируйте код подключения из календаря Rollapp.") }
        let params = Dictionary(parts.queryItems?.map { ($0.name, $0.value ?? "") } ?? [], uniquingKeysWith: { first, _ in first })
        guard let raw = params["server"], let url = URL(string: raw), let host = url.host?.lowercased(), ["xn--80avakiab.xn--p1ai", "rollapp.app", "localhost", "127.0.0.1"].contains(host),
              url.user == nil, url.password == nil, url.query == nil, url.fragment == nil, ["", "/"].contains(url.path),
              url.scheme == "https" || (url.scheme == "http" && ["127.0.0.1", "localhost"].contains(host)),
              let token = params["token"], token.count <= 1500, token.range(of: "^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil else { throw BridgeError.message("Некорректный адрес Rollapp или код подключения. Создайте код в Rollapp заново.") }
        return Connection(server: url, token: token, title: String((params["title"] ?? "Календарь Rollapp").prefix(100)))
    }
}

enum Vault {
    static let service = "rf.rollapp.calendar-device"
    static func read(_ key: String) -> Data? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var value: CFTypeRef?
        return SecItemCopyMatching(query as CFDictionary, &value) == errSecSuccess ? value as? Data : nil
    }
    static func write(_ data: Data, key: String) throws {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key]
        let values: [String: Any] = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        var status = SecItemUpdate(query as CFDictionary, values as CFDictionary)
        if status == errSecItemNotFound { status = SecItemAdd(query.merging(values) { _, new in new } as CFDictionary, nil) }
        guard status == errSecSuccess else { throw BridgeError.message("Не удалось сохранить подключение в Связке ключей (\(status)).") }
    }
    static func remove(_ key: String) {
        SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key] as CFDictionary)
    }
}
struct SavedConnection: Codable { let connection: Connection; let selected: [String]; let automatic: Bool }
struct DeviceEvent: Encodable { let id: String; let title: String; let description: String; let start: String; let end: String; let allDay: Bool; let calendar: String }
struct Snapshot: Encodable { let deviceId: String; let deviceName: String; let from: String; let to: String; let timeZone: String; let events: [DeviceEvent] }
func capped(_ text: String, _ limit: Int) -> String {
    var result = "", size = 0
    for character in text { let value = String(character); let length = value.utf16.count; if size + length > limit { break }; result += value; size += length }
    return result
}
final class NoRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

@MainActor final class CalendarBridge: ObservableObject {
    @Published var draft = ""
    @Published var connection: Connection?
    @Published var calendars: [EKCalendar] = []
    @Published var selected = Set<String>()
    @Published var automatic = false
    @Published var busy = false
    @Published var message = ""
    @Published var failure = ""
    private let store = EKEventStore()
    private var deviceId = ""
    private var restored = false

    func restore() async {
        guard !restored else { return }; restored = true
        if let data = Vault.read("device-id"), let value = String(data: data, encoding: .utf8) { deviceId = value }
        else { deviceId = UUID().uuidString; do { try Vault.write(Data(deviceId.utf8), key: "device-id") } catch { deviceId = ""; failure = error.localizedDescription } }
        if let data = Vault.read("connection"), let saved = try? JSONDecoder().decode(SavedConnection.self, from: data) { connection = saved.connection; selected = Set(saved.selected); automatic = saved.automatic }
        if EKEventStore.authorizationStatus(for: .event) == .fullAccess { refreshCalendars() }
    }
    func applyCode() {
        do { let value = try Connection.parse(draft); connection = value; automatic = false; failure = ""; message = "Выберите календари и нажмите «Синхронизировать». Назначение: \(value.server.absoluteString)" }
        catch { failure = error.localizedDescription }
    }
    func authorize() async {
        guard !busy else { return }; busy = true; failure = ""
        defer { busy = false }
        do {
            guard try await store.requestFullAccessToEvents() else { throw BridgeError.message("Доступ к календарям не разрешён. Его можно изменить в системных настройках конфиденциальности.") }
            store.reset(); refreshCalendars()
        } catch { failure = error.localizedDescription }
    }
    private func refreshCalendars() {
        guard EKEventStore.authorizationStatus(for: .event) == .fullAccess else { calendars = []; return }
        calendars = store.calendars(for: .event).sorted { $0.title.localizedCompare($1.title) == .orderedAscending }
    }
    func storeChanged() async {
        refreshCalendars()
        if automatic { await synchronize() }
    }
    func autoRefresh() async { if automatic { await synchronize() } }
    func disconnect() {
        automatic = false; connection = nil; selected = []; draft = ""; message = "Подключение удалено с устройства. Отзыв доступа и скрытие загруженных событий доступны в Rollapp."; Vault.remove("connection")
    }
    func synchronize() async {
        guard !busy else { return }
        guard let target = connection else { failure = "Сначала примените код подключения."; return }
        guard UUID(uuidString: deviceId) != nil else { failure = "Не удалось сохранить идентификатор устройства в Связке ключей. Перезапустите приложение и проверьте доступ."; return }
        guard EKEventStore.authorizationStatus(for: .event) == .fullAccess else { failure = "Разрешите доступ к календарям устройства."; return }
        refreshCalendars()
        let chosen = calendars.filter { selected.contains($0.calendarIdentifier) }
        guard !chosen.isEmpty else { failure = "Выберите хотя бы один доступный календарь. Пустой выбор не отправляется."; return }
        busy = true; failure = ""
        defer { busy = false }
        do {
            var calendar = Calendar(identifier: .gregorian); calendar.timeZone = .current
            let today = calendar.startOfDay(for: Date())
            guard let from = calendar.date(byAdding: .day, value: -30, to: today), let to = calendar.date(byAdding: .day, value: 365, to: today), let until = calendar.date(byAdding: .day, value: 1, to: to) else { throw BridgeError.message("Не удалось определить период синхронизации.") }
            let native = store.events(matching: store.predicateForEvents(withStart: from, end: until, calendars: chosen))
            guard native.count <= 5000 else { throw BridgeError.message("Больше 5000 событий. Выберите меньше календарей.") }
            let iso = ISO8601DateFormatter(); iso.formatOptions = [.withInternetDateTime]
            let day = DateFormatter(); day.calendar = calendar; day.locale = Locale(identifier: "en_US_POSIX"); day.timeZone = calendar.timeZone; day.dateFormat = "yyyy-MM-dd"
            var unique: [String: DeviceEvent] = [:]
            for event in native {
                guard event.endDate > event.startDate else { throw BridgeError.message("В календаре есть событие с некорректным окончанием. Исправьте его перед синхронизацией.") }
                let base = event.calendarItemExternalIdentifier.flatMap { $0.isEmpty ? nil : $0 } ?? event.calendarItemIdentifier
                let id = base + (event.occurrenceDate.map { ":" + iso.string(from: $0) } ?? ":single")
                let details = [event.notes ?? "", event.location.map { "Место: " + $0 } ?? ""].filter { !$0.isEmpty }.joined(separator: "\n\n")
                unique[id] = DeviceEvent(id: capped(id, 1000), title: capped(event.title ?? "Без названия", 200), description: capped(details, 5000), start: iso.string(from: event.startDate), end: iso.string(from: event.endDate), allDay: event.isAllDay, calendar: capped(event.calendar.title, 200))
            }
            #if os(macOS)
            let name = Host.current().localizedName ?? "Mac"
            #else
            let name = UIDevice.current.name
            #endif
            let payload = Snapshot(deviceId: deviceId, deviceName: capped(name, 100), from: day.string(from: from), to: day.string(from: to), timeZone: calendar.timeZone.identifier, events: unique.values.sorted { $0.id < $1.id })
            let data = try JSONEncoder().encode(payload)
            guard data.count < 4 * 1024 * 1024 else { throw BridgeError.message("Слишком большой объём событий. Выберите меньше календарей.") }
            guard EKEventStore.authorizationStatus(for: .event) == .fullAccess, connection == target else { throw BridgeError.message("Доступ или подключение изменились. Повторите синхронизацию.") }
            var request = URLRequest(url: target.server.appendingPathComponent("api/calendar-device/snapshot")); request.httpMethod = "POST"; request.timeoutInterval = 45
            request.setValue("Bearer \(target.token)", forHTTPHeaderField: "Authorization"); request.setValue("application/json", forHTTPHeaderField: "Content-Type"); request.httpBody = data
            // No EventKit save/remove API exists in this bridge: Calendar is a source only.
            let configuration = URLSessionConfiguration.ephemeral
            configuration.httpShouldSetCookies = false; configuration.httpCookieStorage = nil; configuration.urlCredentialStorage = nil; configuration.urlCache = nil
            let session = URLSession(configuration: configuration, delegate: NoRedirects(), delegateQueue: nil)
            defer { session.invalidateAndCancel() }
            let (body, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                let response = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any]
                throw BridgeError.message(String((response?["error"] as? String ?? "Rollapp не принял события. Проверьте подключение и повторите.").prefix(500)))
            }
            let saved = SavedConnection(connection: target, selected: Array(selected).sorted(), automatic: automatic)
            try Vault.write(JSONEncoder().encode(saved), key: "connection")
            message = "Обновлено \(unique.count) событий. \(Date().formatted(date: .abbreviated, time: .shortened))"
        } catch { failure = error.localizedDescription }
    }
}

struct BridgeView: View {
    @StateObject private var model = CalendarBridge()
    @Environment(\.scenePhase) private var phase
    private let timer = Timer.publish(every: 300, on: .main, in: .common).autoconnect()
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 8) { Text("Rollapp Calendar").font(.largeTitle.bold()); Text("Календарь устройства → Rollapp").font(.headline); Text("Выбранные события отображаются в Rollapp. Приложение не изменяет и не удаляет события Apple Calendar.").foregroundStyle(.secondary) }
                VStack(alignment: .leading, spacing: 8) {
                    Text("Код подключения из Rollapp").font(.headline)
                    TextField("rollapp-calendar://connect?…", text: $model.draft).textFieldStyle(.roundedBorder).privacySensitive()
                    Button("Применить код") { model.applyCode() }.disabled(model.busy || model.draft.isEmpty).frame(minHeight: 48)
                    if let target = model.connection { Text("Назначение: \(target.server.absoluteString)\nКалендарь: \(target.title)").textSelection(.enabled) }
                }
                VStack(alignment: .leading, spacing: 8) {
                    Text("Календари устройства").font(.headline)
                    Text("Для чтения Apple требует системное разрешение «Полный доступ». В этом приложении используются только операции чтения.").foregroundStyle(.secondary)
                    Button("Разрешить чтение календарей") { Task { await model.authorize() } }.disabled(model.busy).frame(minHeight: 48)
                    ForEach(model.calendars, id: \.calendarIdentifier) { item in
                        Toggle(isOn: Binding(get: { model.selected.contains(item.calendarIdentifier) }, set: { model.automatic = false; if $0 { model.selected.insert(item.calendarIdentifier) } else { model.selected.remove(item.calendarIdentifier) } })) { Text(item.title + " · " + item.source.title) }.disabled(model.busy).frame(minHeight: 48)
                    }
                }
                Toggle("Обновлять автоматически, пока приложение открыто", isOn: $model.automatic).disabled(model.busy)
                Text("Передаются названия, описания, места, даты и время выбранных событий. Период: последние 30 дней и следующие 365 дней. Изменённые события обновляются, исчезнувшие скрываются в Rollapp. На iPhone обновление выполняется при активном приложении; фоновое расписание не гарантируется.").foregroundStyle(.secondary)
                if !model.failure.isEmpty { Text(model.failure).foregroundStyle(.red).textSelection(.enabled).accessibilityLabel("Ошибка: " + model.failure) }
                if !model.message.isEmpty { Text(model.message).textSelection(.enabled) }
                HStack(spacing: 8) { Button("Синхронизировать") { Task { await model.synchronize() } }.buttonStyle(.borderedProminent).disabled(model.busy || model.connection == nil || model.selected.isEmpty).frame(minHeight: 48); if model.busy { ProgressView() } }
                if model.connection != nil { Button("Отключить это устройство", role: .destructive) { model.disconnect() }.disabled(model.busy).frame(minHeight: 48) }
            }.padding(24).frame(maxWidth: 640, alignment: .leading).frame(maxWidth: .infinity)
        }
        .task { await model.restore() }
        .onOpenURL { model.draft = $0.absoluteString }
        .onReceive(timer) { _ in Task { await model.autoRefresh() } }
        .onReceive(NotificationCenter.default.publisher(for: .EKEventStoreChanged).debounce(for: .seconds(2), scheduler: RunLoop.main)) { _ in Task { await model.storeChanged() } }
        .onChange(of: phase) { _, value in if value == .active { Task { await model.autoRefresh() } } }
    }
}
#if !CALENDAR_BRIDGE_TEST
@main struct RollappCalendarApp: App {
    var body: some Scene { WindowGroup { BridgeView().frame(minWidth: 320, minHeight: 400) } }
}
#endif
