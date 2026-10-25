import Foundation

@main struct BridgeTests {
    static func main() throws {
        let token = "payload." + String(repeating: "a", count: 43)
        let value = "rollapp-calendar://connect?server=https%3A%2F%2Fxn--80avakiab.xn--p1ai&token=" + token + "&title=Calendar"
        let target = try Connection.parse(value)
        precondition(target.server.scheme == "https" && target.title == "Calendar" && target.token == token)
        let loopback = try Connection.parse(value.replacingOccurrences(of: "https%3A%2F%2Fxn--80avakiab.xn--p1ai", with: "http%3A%2F%2F127.0.0.1%3A5177"))
        precondition(loopback.server.port == 5177)
        for invalid in ["", "https://example.com", value.replacingOccurrences(of: "xn--80avakiab.xn--p1ai", with: "example.com"), value.replacingOccurrences(of: "https%3A", with: "http%3A"), value.replacingOccurrences(of: token, with: "invalid"), value.replacingOccurrences(of: "xn--80avakiab.xn--p1ai", with: "user%40xn--80avakiab.xn--p1ai")] {
            do { _ = try Connection.parse(invalid); fatalError("Accepted invalid connection") } catch {}
        }
        let event = DeviceEvent(id: "native", title: "Событие", description: "Детали", start: "2026-10-25T10:00:00Z", end: "2026-10-25T11:00:00Z", allDay: false, calendar: "На моём Mac")
        let data = try JSONEncoder().encode(Snapshot(deviceId: "a238b3d8-d97e-434a-a0ef-c03b290ee8ee", deviceName: "Mac", from: "2026-10-25", to: "2026-10-26", timeZone: "Europe/Moscow", events: [event]))
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        precondition((json["events"] as! [[String: Any]])[0]["title"] as! String == "Событие")
        let family = "👨‍👩‍👧‍👦"
        precondition(capped(family + "a", family.utf16.count) == family)
        precondition(capped(family, 1).isEmpty)
        print("PASS native bridge connection validation and snapshot encoding; no Calendar/Keychain/network access")
    }
}
