import SwiftUI

struct FriendsScreen: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: RollappStore
    @State private var scope: FriendScope = .subscriptions
    @State private var search = ""
    @State private var directory: Directory?
    @State private var selectedAddress: String?
    @State private var changedPerson: RollappPerson?
    @State private var error: String?
    @State private var revision = 0

    private struct Query: Equatable {
        let scope: FriendScope
        let search: String
        let revision: Int
    }

    private struct Directory {
        let query: Query
        let result: Result<[RollappPerson], Error>
    }

    private var query: Query {
        let text = search.trimmed
        return Query(scope: scope, search: text.hasPrefix("@") ? String(text.dropFirst()) : text, revision: revision)
    }

    var body: some View {
        NavigationStack {
            GeometryReader { geometry in
                ScrollView {
                    VStack(spacing: 24) {
                        HStack(spacing: 4) {
                            ForEach(FriendScope.allCases) { item in
                                Button {
                                    if scope != item {
                                        search = ""
                                        scope = item
                                    }
                                } label: {
                                    Text(item.title)
                                        .font(RollappStyle.font(14, weight: 600))
                                        .multilineTextAlignment(.center)
                                        .frame(maxWidth: .infinity, minHeight: RollappStyle.control)
                                        .background(scope == item ? RollappStyle.secondary : .clear,
                                                    in: RoundedRectangle(cornerRadius: 10))
                                }
                                .buttonStyle(.plain)
                                .accessibilityAddTraits(scope == item ? .isSelected : [])
                            }
                        }
                        .padding(4)
                        .background(RollappStyle.card, in: RoundedRectangle(cornerRadius: 14))
                        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(RollappStyle.border))

                        searchField
                        results(for: query)
                    }
                    .frame(maxWidth: 648)
                    .padding(RollappStyle.inset(geometry.size.width))
                    .frame(maxWidth: .infinity)
                }
                .scrollDismissesKeyboard(.interactively)
                .refreshable { await load(query, debounce: false) }
            }
            .background(RollappStyle.background.ignoresSafeArea())
            .navigationTitle("Друзья")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(item: $selectedAddress) { address in
                PublicWishlistScreen(address: address, subscriptionChanged: { revision += 1 })
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Закрыть", systemImage: "xmark") { dismiss() }
                }
            }
        }
        .preferredColorScheme(.dark)
        .task(id: query) { [query] in await load(query, debounce: !query.search.isEmpty) }
        .confirmationDialog("Отписаться?", isPresented: Binding(get: { changedPerson != nil }, set: {
            if !$0 { changedPerson = nil }
        }), titleVisibility: .visible, presenting: changedPerson) { person in
            Button("Отписаться") { setFollowing(false, person) }
            Button("Отмена", role: .cancel) {}
        } message: { person in
            Text(person.name)
        }
        .rollappError($error)
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(RollappStyle.muted)
                .accessibilityHidden(true)
            TextField(scope.searchPrompt, text: $search)
                .font(RollappStyle.font(18))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
            if !search.isEmpty {
                Button("Очистить поиск", systemImage: "xmark") { search = "" }
                    .labelStyle(.iconOnly)
                    .frame(width: RollappStyle.control, height: RollappStyle.control)
                    .buttonStyle(.plain)
            }
        }
        .padding(.leading, 16)
        .padding(.trailing, 4)
        .frame(minHeight: RollappStyle.control)
        .background(RollappStyle.card, in: Capsule())
        .overlay(Capsule().strokeBorder(RollappStyle.border))
    }

    @ViewBuilder private func results(for query: Query) -> some View {
        if let directory, directory.query == query {
            switch directory.result {
            case let .success(people) where !people.isEmpty:
                LazyVStack(spacing: 8) {
                    ForEach(people) { person in
                        HStack(spacing: 8) {
                            Button {
                                selectedAddress = person.address
                            } label: {
                                HStack(spacing: 12) {
                                    AvatarImage(name: person.name, avatarURL: person.avatarUrl, size: 48)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(person.name).font(RollappStyle.font(18, weight: 600))
                                        Text("@\(person.username) · \(wishCountLabel(person.wishCount))")
                                            .font(RollappStyle.font(13)).foregroundStyle(RollappStyle.muted)
                                    }
                                    .lineLimit(1)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                }
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            if person.isFollowing && person.isFollower {
                                Image(systemName: "star.fill").accessibilityLabel("Взаимная подписка")
                            }
                            Menu {
                                Button(person.isFollowing ? "Отписаться" : "Подписаться",
                                       systemImage: person.isFollowing ? "xmark" : "person.badge.plus") {
                                    if person.isFollowing { changedPerson = person }
                                    else { setFollowing(true, person) }
                                }
                            } label: { RollappControl(symbol: "ellipsis") }
                                .disabled(store.isSaving || store.isRefreshing)
                                .accessibilityLabel("Действия для \(person.name)")
                        }
                        .padding(12)
                        .background(RollappStyle.card, in: RoundedRectangle(cornerRadius: 18))
                        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(RollappStyle.border))
                    }
                }
            case .success:
                ContentUnavailableView(query.search.isEmpty ? scope.emptyTitle : "Никого не нашли", systemImage: scope.symbol)
            case let .failure(error):
                SocialLoadError(title: "Не удалось загрузить людей", error: error) { revision += 1 }
            }
        } else {
            ProgressView("Загрузка…").frame(maxWidth: .infinity, minHeight: 100)
        }
    }

    private func load(_ query: Query, debounce: Bool) async {
        do {
            if debounce { try await Task.sleep(for: .milliseconds(220)) }
            let people = try await store.people(scope: query.scope, search: query.search)
            guard !Task.isCancelled, query == self.query else { return }
            directory = Directory(query: query, result: .success(people))
        } catch {
            guard !Task.isCancelled, !(error is CancellationError), query == self.query else { return }
            directory = Directory(query: query, result: .failure(error))
        }
    }

    private func setFollowing(_ following: Bool, _ person: RollappPerson) {
        Task {
            do {
                try await store.setFollowing(following, address: person.address)
                revision += 1
            } catch { self.error = error.localizedDescription }
        }
    }
}

struct PublicWishlistScreen: View {
    @EnvironmentObject private var store: RollappStore
    @State private var space: WishSpace
    @State private var listID: String?
    @State private var profile: Result<RollappPublicProfile, Error>?
    @State private var detail: RollappWish?
    @State private var error: String?
    @State private var confirmUnfollow = false
    @State private var revision = 0

    let address: String
    var close: (() -> Void)?
    var subscriptionChanged: () -> Void

    init(address: String, initialSpace: WishSpace = .products, close: (() -> Void)? = nil,
         subscriptionChanged: @escaping () -> Void = {}) {
        self.address = address
        self.close = close
        self.subscriptionChanged = subscriptionChanged
        _space = State(initialValue: initialSpace)
    }

    var body: some View {
        GeometryReader { geometry in
            let width = geometry.size.width
            let inset = RollappStyle.inset(width)
            ScrollView {
                VStack(spacing: 24) {
                    switch profile {
                    case let .success(data): content(data, width: width, inset: inset)
                    case let .failure(error):
                        SocialLoadError(title: "Не удалось загрузить профиль", error: error) { revision += 1 }
                    case nil: ProgressView("Загрузка…").frame(maxWidth: .infinity, minHeight: 100)
                    }
                }
                .frame(maxWidth: 1024)
                .padding(.vertical, 24)
                .frame(maxWidth: .infinity)
            }
            .refreshable { await load() }
        }
        .background(RollappStyle.background.ignoresSafeArea())
        .navigationTitle("Вишлист")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let close {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Закрыть", systemImage: "xmark", action: close)
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                ShareLink(item: RollappURL.page(address + "/" + space.rawValue))
                    .accessibilityLabel("Поделиться профилем")
            }
        }
        .sheet(item: $detail) { wish in
            WishDetails(wish: wish, edit: nil)
        }
        .confirmationDialog("Отписаться?", isPresented: $confirmUnfollow, titleVisibility: .visible) {
            Button("Отписаться") { setFollowing(false) }
            Button("Отмена", role: .cancel) {}
        }
        .rollappError($error)
        .task(id: revision) { await load() }
    }

    private func content(_ data: RollappPublicProfile, width: CGFloat, inset: CGFloat) -> some View {
        let selection = data.board.selection(space: space, requested: listID)
        return Group {
            VStack(spacing: 12) {
                AvatarImage(account: data.profile, size: width <= 560 ? 96 : 136)
                Text(data.profile.name).font(RollappStyle.font(width <= 560 ? 30 : 36, weight: 760))
                    .multilineTextAlignment(.center).accessibilityAddTraits(.isHeader)
                Text(data.profile.memberNumber.map { "ID #\($0)" } ?? "@" + data.profile.username)
                    .font(RollappStyle.font(18)).foregroundStyle(RollappStyle.muted)
                if !data.isOwner {
                    Button(data.isFollowing ? "Отписаться" : "Подписаться") {
                        if data.isFollowing { confirmUnfollow = true }
                        else { setFollowing(true) }
                    }
                    .font(RollappStyle.font(18, weight: 500))
                    .padding(.horizontal, 24)
                    .frame(minHeight: RollappStyle.control)
                    .background(RollappStyle.card, in: Capsule())
                    .overlay(Capsule().strokeBorder(RollappStyle.border))
                    .buttonStyle(.plain)
                    .disabled(store.isSaving || store.isRefreshing)
                }
            }
            .padding(.horizontal, inset)

            Menu {
                ForEach(WishSpace.allCases) { category in
                    Button {
                        if space != category { listID = nil; space = category }
                    } label: {
                        Label(category.title, systemImage: space == category ? "checkmark" : category.symbol)
                    }
                }
            } label: {
                Label(space.title, systemImage: "chevron.up.chevron.down")
                    .font(RollappStyle.font(18, weight: 500))
                    .padding(.horizontal, 24)
                    .frame(minHeight: RollappStyle.control)
                    .background(RollappStyle.card, in: Capsule())
                    .overlay(Capsule().strokeBorder(RollappStyle.border))
            }
            .accessibilityLabel("Раздел вишлиста")
            .accessibilityValue(space.title)

            if !selection.tiles.isEmpty {
                ScrollView(.horizontal) {
                    HStack(spacing: 8) {
                        ForEach(selection.tiles) { tile in
                            ListTile(tile: tile, selected: selection.tile?.id == tile.id, mood: data.profile.publicMood,
                                     select: { listID = tile.id }, settings: nil)
                        }
                    }
                    .padding(.horizontal, inset)
                }
                .scrollIndicators(.hidden)
            }
            if selection.entries.isEmpty {
                ContentUnavailableView("В этом списке пока нет желаний", systemImage: "gift")
            } else {
                grid(selection.entries, width: width).padding(.horizontal, inset)
            }
        }
    }

    private func grid(_ entries: [WishBoardSelection.Entry], width: CGFloat) -> some View {
        LazyVGrid(columns: RollappStyle.wishColumns(width), spacing: width <= 640 ? 32 : 48) {
            ForEach(entries) { entry in
                switch entry {
                case let .wish(wish):
                    WishCard(wish: wish, width: width, open: { detail = wish }, edit: nil)
                case let .group(group, wishes):
                    NavigationLink {
                        PublicWishGroupScreen(group: group, wishes: wishes)
                    } label: {
                        GroupCard(group: group, wishes: wishes, width: width)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func load() async {
        do {
            let data = try await store.publicProfile(address: address)
            try Task.checkCancellation()
            profile = .success(data)
        } catch {
            guard !Task.isCancelled, !(error is CancellationError) else { return }
            profile = .failure(error)
        }
    }

    private func setFollowing(_ following: Bool) {
        Task {
            do {
                try await store.setFollowing(following, address: address)
                profile = nil
                revision += 1
                subscriptionChanged()
            } catch { self.error = error.localizedDescription }
        }
    }
}

private struct PublicWishGroupScreen: View {
    let group: WishGroupInfo
    let wishes: [RollappWish]
    @State private var detail: RollappWish?

    var body: some View {
        GeometryReader { geometry in
            let width = geometry.size.width
            ScrollView {
                LazyVGrid(columns: RollappStyle.wishColumns(width), spacing: width <= 640 ? 32 : 48) {
                    ForEach(wishes) { wish in
                        WishCard(wish: wish, width: width, open: { detail = wish }, edit: nil)
                    }
                }
                .padding(RollappStyle.inset(width))
            }
        }
        .background(RollappStyle.background.ignoresSafeArea())
        .navigationTitle(group.title?.nonempty ?? "Группа")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $detail) { WishDetails(wish: $0, edit: nil) }
    }
}

private struct SocialLoadError: View {
    let title: String
    let error: Error
    let retry: () -> Void

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: "wifi.exclamationmark")
        } description: {
            Text(error.localizedDescription)
        } actions: {
            Button("Повторить", action: retry).buttonStyle(.bordered)
        }
    }
}
