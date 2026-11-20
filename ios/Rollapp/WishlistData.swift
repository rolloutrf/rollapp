import Foundation

struct RollappAccount: Decodable, Identifiable {
    let id: String
    let name: String
    let username: String
    let profileSlug: String?
    let avatarUrl: String?
    let memberNumber: String?
    let moodLevel: Int?
    let publicMood: Int?
    let accountType: String?
    let businessCategory: String?
    let sellerSpace: String?
    let canDiscoverSpheres: Bool?

    var address: String { profileSlug ?? username }

    func manages(_ space: WishSpace) -> Bool {
        accountType == "business" && businessCategory == "seller" &&
            (sellerSpace == nil || sellerSpace == space.rawValue)
    }
}

enum WishSpace: String, CaseIterable, Identifiable, Decodable {
    case products, places, events, media, food, transport
    var id: Self { self }
    var title: String {
        switch self {
        case .products: "Товары"
        case .places: "Места"
        case .events: "События"
        case .media: "Медиа"
        case .food: "Еда"
        case .transport: "Транспорт"
        }
    }
    var symbol: String {
        switch self {
        case .products: "bag"
        case .places: "mappin"
        case .events: "calendar"
        case .media: "film"
        case .food: "fork.knife"
        case .transport: "car"
        }
    }
}

struct RollappWish: Decodable, Identifiable {
    let id: String
    let title: String
    let description: String?
    let url: String?
    let imageUrl: String?
    let previewImageUrl: String?
    let price: Double?
    let currency: String?
    let privacy: String?
    let eventDate: String?
    let space: String?
    let listIds: [String]?
    var status: String
    let sharedBy: RollappAccount?

    var isFulfilled: Bool { status == "fulfilled" }
    var category: WishSpace? { space.flatMap(WishSpace.init(rawValue:)) }
    var cover: URL? { RollappURL.link(imageUrl?.nonempty ?? previewImageUrl) }
    var priceText: String? {
        guard let price else { return nil }
        let code = currency ?? "RUB"
        let digits = price.rounded() == price ? 0 : 2
        return price.formatted(.currency(code: code).precision(.fractionLength(digits)).locale(Locale(identifier: "ru_RU")))
    }
}

struct WishListInfo: Decodable, Identifiable {
    let id: String
    let title: String
    let description: String?
    let privacy: String
    let shareToken: String?
    let space: String?

    var category: WishSpace { space.flatMap(WishSpace.init(rawValue:)) ?? .products }
    var isGeneral: Bool { title == "Мои желания" && description == "Всё, чему я буду рад" }
}

struct WishGroupInfo: Decodable, Identifiable {
    let id: String
    let listId: String
    let space: String?
    let title: String?
    let wishIds: [String]
}

struct WishBoard: Decodable {
    var lists: [WishListInfo]
    var wishes: [RollappWish]
    let groups: [WishGroupInfo]?
    let sharedWishes: [RollappWish]?

    func selection(space: WishSpace, requested: String?) -> WishBoardSelection {
        let collections = lists.filter { !$0.isGeneral }
        let listIDs = Set(collections.map(\.id))
        var categoryLists = collections.filter { $0.category == space }
        if let first = categoryLists.firstIndex(where: { $0.title.trimmed.lowercased() == "лайфстайл" }) {
            categoryLists.insert(categoryLists.remove(at: first), at: 0)
        }
        let categoryIDs = Set(categoryLists.map(\.id))
        let inSpace = wishes.filter { wish in
            let ids = Set(wish.listIds ?? [])
            if let category = wish.category {
                return category == space || !ids.isDisjoint(with: categoryIDs)
            }
            return ids.isDisjoint(with: listIDs) ? space == .products : !ids.isDisjoint(with: categoryIDs)
        }
        let unsorted = inSpace.filter { Set($0.listIds ?? []).isDisjoint(with: listIDs) }
        let tiles = (unsorted.isEmpty ? [] : [WishBoardSelection.Tile(list: nil, wishes: unsorted)]) +
            categoryLists.map { list in
                .init(list: list, wishes: inSpace.filter { ($0.listIds ?? []).contains(list.id) })
            }
        let tile = tiles.first { $0.id == requested } ?? tiles.first
        let contents = tile?.wishes ?? []
        let groupList = tile?.list?.id ?? lists.first(where: \.isGeneral)?.id
        let validGroups = (groups ?? []).filter {
            $0.listId == groupList && (tile?.list != nil || $0.space == space.rawValue)
        }
        let groupsByWish = validGroups.reduce(into: [String: WishGroupInfo]()) { result, group in
            for id in group.wishIds where result[id] == nil { result[id] = group }
        }
        var insertedGroups = Set<String>()
        let entries = contents.compactMap { wish -> WishBoardSelection.Entry? in
            guard let group = groupsByWish[wish.id] else { return .wish(wish) }
            guard insertedGroups.insert(group.id).inserted else { return nil }
            return .group(group, contents.filter { groupsByWish[$0.id]?.id == group.id })
        }
        return .init(tiles: tiles, tile: tile, entries: entries,
                     shared: (sharedWishes ?? []).filter { ($0.category ?? .products) == space })
    }
}

struct WishBoardSelection {
    struct Tile: Identifiable {
        let list: WishListInfo?
        let wishes: [RollappWish]
        var id: String { list?.id ?? "all" }
        var title: String { list?.title ?? "Не отсортированные" }
    }
    enum Entry: Identifiable {
        case wish(RollappWish)
        case group(WishGroupInfo, [RollappWish])
        var id: String {
            switch self {
            case let .wish(wish): "wish/" + wish.id
            case let .group(group, _): "group/" + group.id
            }
        }
    }
    let tiles: [Tile]
    let tile: Tile?
    let entries: [Entry]
    let shared: [RollappWish]
}

struct WishDraft: Encodable {
    let title: String
    let description: String
    let url: String
    let price: Double?
    let currency: String
    let privacy: String
    let space: String?
    let listIds: [String]?

    enum CodingKeys: String, CodingKey {
        case title, description, url, price, currency, privacy, space, listIds
    }

    func encode(to encoder: Encoder) throws {
        var fields = encoder.container(keyedBy: CodingKeys.self)
        try fields.encode(title, forKey: .title)
        try fields.encode(description, forKey: .description)
        try fields.encode(url, forKey: .url)
        try fields.encode(price, forKey: .price)
        try fields.encode(currency, forKey: .currency)
        try fields.encode(privacy, forKey: .privacy)
        try fields.encodeIfPresent(space, forKey: .space)
        try fields.encodeIfPresent(listIds, forKey: .listIds)
    }
}

struct WishListDraft: Encodable {
    let title: String
    let description: String
    let privacy: String
    let space: String?
}

extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
    var nonempty: String? { trimmed.isEmpty ? nil : trimmed }
}

func wishCountLabel(_ count: Int) -> String {
    let last = count % 10
    let lastTwo = count % 100
    if last == 1 && lastTwo != 11 { return "\(count) желание" }
    if (2...4).contains(last) && !(12...14).contains(lastTwo) { return "\(count) желания" }
    return "\(count) желаний"
}

enum FriendScope: String, CaseIterable, Identifiable {
    case subscriptions, followers, discover

    var id: Self { self }

    var title: String {
        switch self {
        case .subscriptions: "Подписки"
        case .followers: "Подписчики"
        case .discover: "Найти друзей"
        }
    }

    var searchPrompt: String {
        switch self {
        case .subscriptions: "Поиск по подпискам"
        case .followers: "Поиск по подписчикам"
        case .discover: "Имя или @профиль"
        }
    }

    var emptyTitle: String {
        switch self {
        case .subscriptions: "Подписок пока нет"
        case .followers: "Подписчиков пока нет"
        case .discover: "Никого не нашли"
        }
    }

    var symbol: String {
        switch self {
        case .subscriptions: "person.2"
        case .followers: "person.crop.circle"
        case .discover: "person.badge.plus"
        }
    }
}

struct RollappPerson: Decodable, Identifiable {
    let id: String
    let name: String
    let username: String
    let profileSlug: String?
    let avatarUrl: String?
    let wishCount: Int
    let isFollowing: Bool
    let isFollower: Bool

    var address: String { profileSlug ?? username }
}

struct RollappPublicProfile: Decodable {
    let profile: RollappAccount
    let board: WishBoard
    let isOwner: Bool
    let isFollowing: Bool

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        profile = try values.decode(RollappAccount.self, forKey: .profile)
        isOwner = try values.decode(Bool.self, forKey: .isOwner)
        isFollowing = try values.decode(Bool.self, forKey: .isFollowing)
        board = try WishBoard(from: decoder)
    }

    private enum CodingKeys: String, CodingKey { case profile, isOwner, isFollowing }
}
