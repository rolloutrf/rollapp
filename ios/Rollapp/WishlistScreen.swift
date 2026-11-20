import CoreText
import SwiftUI

enum RollappStyle {
    static let background = Color(white: 10.0 / 255)
    static let foreground = Color(white: 250.0 / 255)
    static let card = Color(white: 23.0 / 255)
    static let secondary = Color(white: 38.0 / 255)
    static let muted = Color(white: 163.0 / 255)
    static let primary = Color(white: 229.0 / 255)
    static let border = Color.white.opacity(0.15)
    static let control: CGFloat = 48
    static let gap: CGFloat = 8

    private static let geist: CGFont? = {
        guard let url = Bundle.main.url(forResource: "Geist", withExtension: "ttf"),
              let provider = CGDataProvider(url: url as CFURL),
              let font = CGFont(provider) else { return nil }
        CTFontManagerRegisterGraphicsFont(font, nil)
        return font
    }()

    static func font(_ size: CGFloat, weight: Int = 400) -> Font {
        guard let geist else { return .system(size: size) }
        let base = CTFontCreateWithGraphicsFont(geist, size, nil, nil)
        let axes = CTFontCopyVariationAxes(base) as? [[String: Any]]
        guard let axis = axes?.first?[kCTFontVariationAxisIdentifierKey as String] as? NSNumber else {
            return Font(base)
        }
        let descriptor = CTFontDescriptorCreateCopyWithVariation(CTFontCopyFontDescriptor(base), axis, CGFloat(weight))
        return Font(CTFontCreateWithFontDescriptor(descriptor, size, nil))
    }

    static func wishColumns(_ width: CGFloat) -> [GridItem] {
        Array(repeating: GridItem(.flexible(minimum: 0), spacing: width <= 640 ? 8 : 24),
              count: width <= 640 ? 2 : width < 1024 ? 3 : 4)
    }

    static func inset(_ width: CGFloat) -> CGFloat {
        width <= 640 ? 16 : width <= 1180 ? 24 : 32
    }
}

struct RollappControl: View {
    let symbol: String
    var prominent = false
    var glass = false

    var body: some View {
        let icon = Image(systemName: symbol)
            .font(.system(size: 20, weight: .regular))
            .frame(width: RollappStyle.control, height: RollappStyle.control)
            .accessibilityHidden(true)

        Group {
            if #available(iOS 26.0, *), glass {
                icon.foregroundStyle(prominent ? RollappStyle.card : RollappStyle.foreground)
                    .glassEffect(prominent ? .regular.tint(RollappStyle.primary).interactive() : .regular.interactive(), in: Circle())
            } else {
                icon.foregroundStyle(prominent ? RollappStyle.card : RollappStyle.foreground)
                    .background(prominent ? RollappStyle.primary : RollappStyle.card, in: Circle())
                    .overlay(Circle().strokeBorder(prominent ? .clear : RollappStyle.border))
            }
        }
        .contentShape(Rectangle())
    }
}

struct WishlistScreen: View {
    @EnvironmentObject private var store: RollappStore
    let account: RollappAccount

    @State private var space: WishSpace = .products
    @State private var listID: String?
    @State private var path: [WishlistRoute] = []
    @State private var menu: DockMenu?
    @State private var editor: WishlistEditorRoute?
    @State private var shouldRefreshAfterWeb = false
    @State private var error: String?
    @State private var confirmSignOut = false

    private enum DockMenu { case spheres, spaces, add }
    private enum WishlistRoute: Hashable { case wish(String), group(String) }

    private var selection: WishBoardSelection? { store.board?.selection(space: space, requested: listID) }

    var body: some View {
        NavigationStack(path: $path) {
            GeometryReader { geometry in
                let width = geometry.size.width
                let inset = RollappStyle.inset(width)
                let desktop = width >= 768
                ZStack(alignment: .bottom) {
                    ScrollViewReader { scroll in
                        ZStack(alignment: .top) {
                            ScrollView {
                                VStack(spacing: 0) {
                                    Color.clear.frame(height: 54).id("top").accessibilityHidden(true)
                                    hero(width: width, inset: inset)
                                    board(width: width, inset: inset)
                                }
                                .frame(maxWidth: 1024)
                                .frame(maxWidth: .infinity)
                                .padding(.bottom, 96)
                            }
                            .refreshable { await store.refresh() }
                            if menu != nil {
                                Color.black.opacity(0.001)
                                    .contentShape(Rectangle())
                                    .onTapGesture { menu = nil }
                                    .accessibilityHidden(true)
                                    .ignoresSafeArea()
                            }
                            VStack(spacing: 8) {
                                header(desktop: desktop) {
                                    path = []
                                    selectSpace(.products)
                                    scroll.scrollTo("top", anchor: .top)
                                }
                                if desktop && (menu == .spheres || menu == .spaces) {
                                    dockMenu.frame(maxWidth: .infinity, alignment: menu == .spheres ? .leading : .center)
                                }
                            }
                            .frame(maxWidth: 1280)
                            .padding(.horizontal, inset)
                            .padding(.top, 8)
                        }
                    }
                    VStack(alignment: .trailing, spacing: 8) {
                        if !desktop || menu == .add { dockMenu }
                        dock(desktop: desktop)
                    }
                    .frame(maxWidth: 1280)
                    .padding(.horizontal, inset)
                    .padding(.bottom, 16)
                }
            }
            .background(RollappStyle.background.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: WishlistRoute.self) { destination in
                switch destination {
                case let .wish(id):
                    if let wish = (store.board?.wishes ?? []).first(where: { $0.id == id }) ??
                        store.board?.sharedWishes?.first(where: { $0.id == id }) {
                        WishDetails(wish: wish, edit: { editor = .wish(wish, space, nil) })
                    } else {
                        ContentUnavailableView("Желание недоступно", systemImage: "gift")
                    }
                case let .group(id):
                    if let entry = selection?.entries.first(where: { $0.id == "group/" + id }),
                       case let .group(group, wishes) = entry {
                        GeometryReader { proxy in
                            ScrollView { grid(wishes.map(WishBoardSelection.Entry.wish), width: proxy.size.width)
                                .padding(RollappStyle.inset(proxy.size.width)) }
                        }
                        .background(RollappStyle.background.ignoresSafeArea())
                        .navigationTitle(group.title?.nonempty ?? "Группа")
                        .navigationBarTitleDisplayMode(.inline)
                    }
                }
            }
            .sheet(item: $editor, onDismiss: {
                menu = nil
                if shouldRefreshAfterWeb {
                    shouldRefreshAfterWeb = false
                    Task { await store.refresh() }
                }
            }) { route in
                switch route {
                case let .wish(wish, space, list):
                    WishForm(wish: wish, space: space, list: list)
                case let .list(list, space):
                    WishListForm(list: list, space: space) { saved in listID = saved.id }
                case .profile:
                    profile
                case .friends:
                    FriendsScreen()
                case let .web(page):
                    InAppWebScreen(page).onAppear { shouldRefreshAfterWeb = true }
                case let .publicProfile(address, space):
                    NavigationStack { PublicWishlistScreen(address: address, initialSpace: space, close: { editor = nil }) }
                }
            }
            .rollappError($error)
        }
        .preferredColorScheme(.dark)
    }

    private func selectSpace(_ space: WishSpace) {
        if self.space != space { listID = nil }
        self.space = space
        menu = nil
    }

    private func header(desktop: Bool, home: @escaping () -> Void) -> some View {
        ZStack {
            if desktop { spaceButton.frame(maxWidth: 200) }
            HStack(spacing: RollappStyle.gap) {
                Button(action: home) {
                    Image("RollappMark").resizable().scaledToFit()
                        .frame(width: 34, height: 34)
                        .frame(width: 44, height: 48)
                }
                .accessibilityLabel("Rollapp — в приложение")
                if desktop { sphereButton }
                Spacer()
                if let shareURL {
                    ShareLink(item: shareURL) {
                        RollappControl(symbol: "square.and.arrow.up", glass: true)
                    }
                    .accessibilityLabel("Поделиться")
                } else {
                    Button {
                        error = "Приватный список виден только вам."
                    } label: {
                        RollappControl(symbol: "square.and.arrow.up", glass: true)
                    }
                    .accessibilityLabel("Поделиться")
                }
            }
        }
        .buttonStyle(.plain)
    }

    private func hero(width: CGFloat, inset: CGFloat) -> some View {
        let size: CGFloat = width <= 560 ? 96 : width <= 820 ? 112 : width <= 1180 ? 136 : 160
        return VStack(spacing: 12) {
            Button { editor = .profile } label: {
                AvatarImage(account: account, size: size)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Профиль \(account.name)")
            VStack(spacing: 0) {
                Text(account.name)
                    .font(RollappStyle.font(width <= 560 ? 30 : width <= 820 ? 36 : 52, weight: 760))
                    .tracking(width <= 560 ? -1.5 : -1.8)
                    .multilineTextAlignment(.center)
                    .accessibilityAddTraits(.isHeader)
                    .padding(.horizontal, inset)
                HStack(spacing: 8) {
                    if let number = account.memberNumber?.nonempty { Text("ID #\(number)") }
                    Button { editor = .friends } label: {
                        Label("Друзья", systemImage: "person.2").frame(minHeight: 48)
                    }
                    .buttonStyle(.plain)
                }
                .font(RollappStyle.font(18))
                .foregroundStyle(RollappStyle.muted)
                heroActions(inset: inset, width: width)
                if account.manages(space) {
                    Button {
                        editor = .publicProfile(account.address, space)
                    } label: {
                        Text("Моя страница").font(RollappStyle.font(18))
                            .padding(.horizontal, 24)
                            .frame(minHeight: 48)
                            .overlay(Capsule().strokeBorder(RollappStyle.border))
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 16)
                }
            }
        }
        .foregroundStyle(RollappStyle.foreground)
        .padding(.top, width <= 560 ? 28 : 38)
        .padding(.bottom, width <= 560 ? 26 : 30)
    }

    private func heroActions(inset: CGFloat, width: CGFloat) -> some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                Button { selectSpace(space) } label: { RollappControl(symbol: "gift", prominent: true) }
                    .accessibilityLabel("Вишлист")
                ForEach(sectionLinks) { link in
                    Button {
                        editor = .web(.init(title: link.title, url: link.url(space: space)))
                    } label: {
                        RollappControl(symbol: link.symbol)
                    }
                    .accessibilityLabel(link.title)
                }
            }
            .buttonStyle(.plain)
            .padding(.horizontal, inset)
            .frame(minWidth: width > 1024 ? 1024 : width)
        }
        .scrollIndicators(.hidden)
    }

    @ViewBuilder private func board(width: CGFloat, inset: CGFloat) -> some View {
        if let selection {
            VStack(spacing: 24) {
                if let message = store.boardError { failure(message) }
                if !selection.tiles.isEmpty { listRail(selection, inset: inset, width: width) }
                if selection.entries.isEmpty && selection.shared.isEmpty {
                    VStack(spacing: 8) {
                        Image(systemName: "heart").font(.system(size: 28)).foregroundStyle(RollappStyle.muted)
                        Text("В этом списке пока пусто").font(RollappStyle.font(20, weight: 600))
                        Text("Добавьте то, что действительно порадует.")
                            .font(RollappStyle.font(18)).foregroundStyle(RollappStyle.muted)
                    }
                    .multilineTextAlignment(.center)
                    .padding(24)
                }
                grid(selection.entries, width: width).padding(.horizontal, inset)
                if !selection.shared.isEmpty {
                    Text("Доступно мне").font(RollappStyle.font(20, weight: 600))
                    grid(selection.shared.map(WishBoardSelection.Entry.wish), width: width)
                        .padding(.horizontal, inset)
                }
            }
            .foregroundStyle(RollappStyle.foreground)
        } else if let message = store.boardError {
            failure(message)
        } else {
            ProgressView("Собираем желания…").padding(32)
        }
    }

    private func failure(_ message: String) -> some View {
        VStack(spacing: 12) {
            Text("Не удалось загрузить Вишлист").font(RollappStyle.font(18, weight: 600))
            Text(message).font(RollappStyle.font(18)).foregroundStyle(RollappStyle.muted)
            Button("Повторить") { Task { await store.refresh() } }
                .buttonStyle(.bordered)
                .disabled(store.isRefreshing)
        }
        .padding(16)
    }

    private func listRail(_ selection: WishBoardSelection, inset: CGFloat, width: CGFloat) -> some View {
        ScrollViewReader { scroll in
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    ForEach(selection.tiles) { tile in
                        let selected = selection.tile?.id == tile.id
                        ListTile(tile: tile, selected: selected, mood: account.moodLevel ?? account.publicMood) {
                            listID = tile.id
                        } settings: { list in
                            editor = .list(list, space)
                        }
                        .id(tile.id)
                    }
                }
                .padding(.horizontal, inset)
                .frame(minWidth: min(width, 1024))
            }
            .scrollIndicators(.hidden)
            .onChange(of: selection.tile?.id, initial: true) { _, id in
                if let id { scroll.scrollTo(id, anchor: .center) }
            }
        }
    }

    private func grid(_ entries: [WishBoardSelection.Entry], width: CGFloat) -> some View {
        LazyVGrid(columns: RollappStyle.wishColumns(width), alignment: .center, spacing: width <= 640 ? 32 : 48) {
            ForEach(entries) { entry in
                switch entry {
                case let .wish(wish):
                    WishCard(wish: wish, width: width) { path.append(.wish(wish.id)) } edit: {
                        editor = .wish(wish, wish.category ?? space, nil)
                    }
                case let .group(group, wishes):
                    Button { path.append(.group(group.id)) } label: {
                        GroupCard(group: group, wishes: wishes, width: width)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func dock(desktop: Bool) -> some View {
        HStack(spacing: 8) {
            if !desktop {
                sphereButton
                spaceButton
            } else {
                Spacer(minLength: 0)
            }
            if store.board != nil {
                Button { toggle(.add) } label: { RollappControl(symbol: "plus", prominent: true, glass: true) }
                    .accessibilityLabel("Добавить")
            }
        }
        .buttonStyle(.plain)
    }

    private var sphereButton: some View {
        Button { toggle(.spheres) } label: { RollappControl(symbol: "square.grid.2x2", glass: true) }
            .buttonStyle(.plain)
            .accessibilityLabel("Открыть переключатель сфер")
    }

    private var spaceButton: some View {
        Button { toggle(.spaces) } label: {
            HStack(spacing: 8) {
                Image(systemName: space.symbol).font(.system(size: 20))
                Text(space.title).font(RollappStyle.font(18, weight: 500)).lineLimit(1)
                Image(systemName: "chevron.down").font(.system(size: 16))
            }
            .frame(maxWidth: .infinity, minHeight: 48)
            .foregroundStyle(RollappStyle.foreground)
            .background(RollappStyle.card, in: Capsule())
            .overlay(Capsule().strokeBorder(RollappStyle.border))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Раздел сервиса Вишлист")
        .accessibilityValue(space.title)
    }

    private func toggle(_ next: DockMenu) { menu = menu == next ? nil : next }

    @ViewBuilder private var dockMenu: some View {
        if let menu {
            ViewThatFits(in: .vertical) {
                menuItems(menu)
                ScrollView { menuItems(menu) }
                    .frame(maxHeight: 240)
            }
            .padding(8)
            .frame(maxWidth: menu == .add ? 240 : 360)
            .background(RollappStyle.card, in: RoundedRectangle(cornerRadius: 24))
            .overlay(RoundedRectangle(cornerRadius: 24).strokeBorder(RollappStyle.border))
        }
    }

    @ViewBuilder private func menuItems(_ menu: DockMenu) -> some View {
        VStack(spacing: 0) {
            switch menu {
            case .spaces:
                ForEach(WishSpace.allCases) { item in
                    menuRow(item.title, icon: item.symbol, selected: space == item) { selectSpace(item) }
                }
            case .spheres:
                ForEach(sphereLinks) { link in
                    let isWishlist = link.path == "app/wishes"
                    menuRow(link.title, icon: link.symbol, selected: isWishlist) {
                        self.menu = nil
                        if !isWishlist { editor = .web(.init(title: link.title, url: link.url())) }
                    }
                }
            case .add:
                menuRow("Добавить желание", icon: "plus") {
                    self.menu = nil
                    editor = .wish(nil, space, selection?.tile?.list)
                }
                menuRow("Новый список", icon: "list.bullet.badge.plus") {
                    self.menu = nil
                    editor = .list(nil, space)
                }
            }
        }
    }

    private func menuRow(_ title: String, icon: String, selected: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 16) {
                Image(systemName: icon).font(.system(size: 20)).frame(width: 24)
                Text(title).font(RollappStyle.font(18))
                Spacer()
                if selected { Image(systemName: "checkmark") }
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 48)
            .foregroundStyle(RollappStyle.foreground)
            .background(selected ? RollappStyle.secondary : .clear, in: RoundedRectangle(cornerRadius: 12))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var shareURL: URL? {
        if let list = selection?.tile?.list {
            if list.privacy == "private" { return nil }
            if list.privacy == "link", let token = list.shareToken { return RollappURL.page("s/" + token) }
            return RollappURL.page(account.address + "/lists/" + list.id)
        }
        return RollappURL.page(account.address + "/" + space.rawValue)
    }

    private var profile: some View {
        NavigationStack {
            VStack(spacing: 16) {
                AvatarImage(account: account, size: 96)
                Text(account.name).font(RollappStyle.font(30, weight: 760))
                Text("@" + account.username).foregroundStyle(RollappStyle.muted)
                NavigationLink {
                    PublicWishlistScreen(address: account.address, initialSpace: space)
                } label: { Text("Моя страница").frame(minHeight: 48) }
                Button("Выйти из аккаунта") { confirmSignOut = true }
                .disabled(store.isRefreshing || store.isSaving)
                .frame(minHeight: 48)
            }
            .navigationTitle("Профиль")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Закрыть") { editor = nil } } }
        }
        .alert("Выйти из аккаунта?", isPresented: $confirmSignOut) {
            Button("Отмена", role: .cancel) {}
            Button("Выйти") {
                Task {
                    do { try await store.signOut(); editor = nil }
                    catch { self.error = error.localizedDescription; editor = nil }
                }
            }
        }
    }

    private struct Destination: Identifiable {
        let title: String
        let symbol: String
        let path: String
        var parameter: URLQueryItem? = nil
        var id: String { title }

        func url(space: WishSpace? = nil) -> URL {
            var url = RollappURL.page(path)
            if let space { url = url.appending(queryItems: [URLQueryItem(name: "tab", value: space.rawValue)]) }
            if let parameter { url = url.appending(queryItems: [parameter]) }
            return url
        }
    }

    private var sectionLinks: [Destination] {
        var links: [Destination] = [
            .init(title: "Лента", symbol: "newspaper", path: "app/wishes/catalog"),
            .init(title: "Каталог брендов", symbol: "bag", path: "app/wishes/catalog", parameter: .init(name: "source", value: "brands")),
            .init(title: "Магазин", symbol: "storefront", path: "app/store"),
            .init(title: "Предложения", symbol: "paperplane", path: "app/wishes/offers")
        ]
        if account.accountType == "personal" || account.manages(space) {
            links.append(.init(title: "Мои продажи", symbol: "tag", path: "app/wishes/sales"))
        }
        return links + [
            .init(title: "Календарь", symbol: "calendar", path: "app/wishes", parameter: .init(name: "publication", value: "calendar")),
            .init(title: "Доска объявлений", symbol: "megaphone", path: "app/wishes", parameter: .init(name: "publication", value: "announcements"))
        ]
    }

    private var sphereLinks: [Destination] {
        [
            .init(title: "Идентичность", symbol: "touchid", path: "app/spheres/identity"),
            .init(title: "Здоровье", symbol: "heart.text.square", path: "app/spheres/health"),
            .init(title: "Вишлист", symbol: "gift", path: "app/wishes"),
            .init(title: "Образование", symbol: "graduationcap", path: "app/spheres/education"),
            .init(title: "Карьера", symbol: "briefcase", path: "app/spheres/career"),
            .init(title: "Планирование", symbol: "rectangle.split.3x1", path: "app/planning"),
            .init(title: "Роллы", symbol: "circle.hexagongrid", path: "app/rolls")
        ]
    }
}
