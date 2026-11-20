import SwiftUI

struct AvatarImage: View {
    let name: String
    let avatarURL: String?
    let size: CGFloat

    init(name: String, avatarURL: String?, size: CGFloat) {
        self.name = name
        self.avatarURL = avatarURL
        self.size = size
    }

    init(account: RollappAccount, size: CGFloat) {
        self.init(name: account.name, avatarURL: account.avatarUrl, size: size)
    }

    var body: some View {
        AsyncImage(url: RollappURL.link(avatarURL)) { phase in
            if let image = phase.image {
                image.resizable().scaledToFill()
            } else {
                Text(name.split(separator: " ").prefix(2).compactMap(\.first).map(String.init).joined())
                    .font(RollappStyle.font(size / 4, weight: 700))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(RollappStyle.secondary)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .accessibilityHidden(true)
    }
}

struct ListTile: View {
    let tile: WishBoardSelection.Tile
    let selected: Bool
    let mood: Int?
    let select: () -> Void
    let settings: ((WishListInfo) -> Void)?

    var body: some View {
        Button(action: select) {
            VStack(alignment: .leading, spacing: 4) {
                Text(tile.title)
                    .font(RollappStyle.font(16, weight: 500))
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .padding(.trailing, tile.list == nil || settings == nil ? 0 : 14)
                Spacer(minLength: 0)
                HStack(spacing: 4) {
                    if tile.list?.privacy == "private" { Image(systemName: "lock").font(.system(size: 12)) }
                    Text(tile.wishes.count.formatted())
                        .font(RollappStyle.font(24, weight: 600))
                        .monospacedDigit()
                }
                .foregroundStyle(selected ? RollappStyle.foreground : RollappStyle.muted)
            }
            .padding(12)
            .frame(width: 130, height: 100, alignment: .leading)
            .foregroundStyle(RollappStyle.foreground)
            .background {
                if selected {
                    RoundedRectangle(cornerRadius: 18).fill(
                        RadialGradient(stops: [
                            .init(color: tint, location: 0),
                            .init(color: tint.opacity(0.85), location: 0.41),
                            .init(color: Color(white: 0.08), location: 1)
                        ], center: UnitPoint(x: 0.45, y: 1.1), startRadius: 0, endRadius: 73)
                    )
                    .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(tint.opacity(0.38)))
                } else {
                    RoundedRectangle(cornerRadius: 18).fill(RollappStyle.secondary)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(tile.title)
        .accessibilityValue(tile.wishes.count.formatted())
        .accessibilityAddTraits(selected ? .isSelected : [])
        .overlay(alignment: .topTrailing) {
            if let list = tile.list, let settings {
                Button { settings(list) } label: {
                    Image(systemName: "ellipsis").font(.system(size: 14))
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Настройки списка «\(list.title)»")
            }
        }
    }

    private var tint: Color {
        switch mood {
        case 1: Color(white: 0.24)
        case 2: Color(white: 0.29)
        case 3: Color(white: 0.34)
        case 4: Color(white: 0.39)
        case 5: Color(white: 0.46)
        default: Color(white: 0.76)
        }
    }
}

struct WishCover: View {
    let url: URL?
    let symbol: String
    var ratio: CGFloat = 236.0 / 286
    var corner: CGFloat = 15

    var body: some View {
        Rectangle()
            .fill(RollappStyle.card)
            .aspectRatio(ratio, contentMode: .fit)
            .overlay {
                GeometryReader { geometry in
                    AsyncImage(url: url) { phase in
                        if let image = phase.image {
                            image.resizable().scaledToFill()
                                .frame(width: geometry.size.width, height: geometry.size.height, alignment: .top)
                        } else {
                            Image(systemName: symbol)
                                .font(.system(size: 36, weight: .regular))
                                .foregroundStyle(RollappStyle.primary)
                                .frame(width: geometry.size.width, height: geometry.size.height)
                        }
                    }
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: corner))
            .accessibilityHidden(true)
    }
}

struct WishCard: View {
    let wish: RollappWish
    let width: CGFloat
    let open: () -> Void
    let edit: (() -> Void)?

    var body: some View {
        Button(action: open) {
            VStack(alignment: .leading, spacing: width <= 820 ? 0 : 6) {
                WishCover(url: wish.cover, symbol: wish.category?.symbol ?? "gift",
                          ratio: wish.category == .media ? 16.0 / 9 : 236.0 / 286, corner: width <= 820 ? 15 : 20)
                    .opacity(wish.isFulfilled ? 0.68 : 1)
                    .padding(.bottom, width <= 820 ? min(12.1875, max(10, width * 0.03125)) : 10)
                Text(wish.title)
                    .font(RollappStyle.font(fontSize, weight: 500))
                    .lineLimit(1)
                    .foregroundStyle(RollappStyle.foreground)
                if let price = wish.priceText {
                    Text(price)
                        .font(RollappStyle.font(fontSize, weight: 500))
                        .foregroundStyle(RollappStyle.muted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(wish.title)
        .accessibilityValue(wish.priceText ?? "")
        .overlay(alignment: .topTrailing) {
            if wish.sharedBy == nil, let edit {
                Menu {
                    Button("Открыть", systemImage: "arrow.up.right", action: open)
                    Button("Редактировать", systemImage: "pencil", action: edit)
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 15, weight: .semibold))
                        .frame(width: 30, height: 30)
                        .background(RollappStyle.secondary, in: Circle())
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("Действия с желанием «\(wish.title)»")
            }
        }
    }

    private var fontSize: CGFloat { min(18, max(14, width * 0.04375)) }
}

struct GroupCard: View {
    let group: WishGroupInfo
    let wishes: [RollappWish]
    let width: CGFloat

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Rectangle()
                .fill(RollappStyle.secondary)
                .aspectRatio(236.0 / 286, contentMode: .fit)
                .overlay {
                    GeometryReader { geometry in
                        let inset = geometry.size.width * 0.12
                        let gap = geometry.size.width * 0.07
                        let cell = CGSize(
                            width: max(0, (geometry.size.width - 2 * inset - gap) / 2),
                            height: max(0, (geometry.size.height - 2 * inset - gap) / 2)
                        )
                        LazyVGrid(columns: Array(repeating: GridItem(.fixed(cell.width), spacing: gap), count: 2), spacing: gap) {
                            ForEach(wishes.prefix(4)) { wish in
                                WishCover(url: wish.cover, symbol: "gift", ratio: cell.width / max(1, cell.height), corner: 10)
                            }
                        }
                        .padding(inset)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: width <= 820 ? 15 : 20))
            Text(group.title?.nonempty ?? "Группа")
                .font(RollappStyle.font(min(18, max(14, width * 0.04375)), weight: 500))
                .lineLimit(1)
                .padding(.top, 6)
            Text(wishCountLabel(wishes.count))
                .font(RollappStyle.font(16, weight: 500))
                .foregroundStyle(RollappStyle.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct WishDetails: View {
    @EnvironmentObject private var store: RollappStore
    @Environment(\.dismiss) private var dismiss
    let wish: RollappWish
    let edit: (() -> Void)?
    @State private var error: String?
    @State private var confirmDelete = false
    @State private var linkedPage: InAppPage?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if wish.cover != nil {
                    WishCover(url: wish.cover, symbol: wish.category?.symbol ?? "gift",
                              ratio: wish.category == .media ? 16.0 / 9 : 1, corner: 20)
                }
                Text(wish.title).font(RollappStyle.font(30, weight: 760)).accessibilityAddTraits(.isHeader)
                if let price = wish.priceText {
                    Text(price).font(RollappStyle.font(18, weight: 500)).foregroundStyle(RollappStyle.muted)
                }
                if let description = wish.description?.nonempty {
                    Text(description).font(RollappStyle.font(18)).lineSpacing(6).textSelection(.enabled)
                }
                if let date = wish.eventDate?.nonempty {
                    Label(date, systemImage: "calendar").foregroundStyle(RollappStyle.muted)
                }
                if wish.privacy == "private" {
                    Label("Видно только вам", systemImage: "lock").foregroundStyle(RollappStyle.muted)
                }
            }
            .frame(maxWidth: 648, alignment: .leading)
            .padding(16)
            .frame(maxWidth: .infinity)
        }
        .background(RollappStyle.background.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .safeAreaInset(edge: .bottom) {
            HStack(spacing: 8) {
                Button { dismiss() } label: { RollappControl(symbol: "chevron.left") }
                    .accessibilityLabel("Назад")
                if let url = RollappURL.link(wish.url, allowHTTP: true) {
                    Button { linkedPage = InAppPage(link: url) } label: {
                        Text("Открыть ссылку")
                            .font(RollappStyle.font(18, weight: 500))
                            .lineLimit(1)
                            .frame(maxWidth: .infinity, minHeight: 48)
                            .foregroundStyle(RollappStyle.card)
                            .background(RollappStyle.primary, in: Capsule())
                    }
                } else {
                    Spacer()
                }
                if wish.sharedBy == nil, let edit {
                    Menu {
                        Button("Редактировать", systemImage: "pencil", action: edit)
                        Button(wish.isFulfilled ? "Вернуть в активные" : "Отметить исполненным",
                               systemImage: "checkmark") { fulfill() }
                        Button("Удалить желание", systemImage: "trash") { confirmDelete = true }
                    } label: {
                        RollappControl(symbol: "ellipsis")
                    }
                    .disabled(store.isSaving || store.isRefreshing)
                    .accessibilityLabel("Другие действия")
                }
            }
            .buttonStyle(.plain)
            .frame(maxWidth: 680)
            .padding(.horizontal, 16)
            .padding(.bottom, 16)
        }
        .sheet(item: $linkedPage) { destination in
            InAppWebScreen(destination)
        }
        .alert("Удалить желание?", isPresented: $confirmDelete) {
            Button("Отмена", role: .cancel) {}
            Button("Удалить желание") {
                Task {
                    do { try await store.deleteWish(wish.id); dismiss() }
                    catch { self.error = error.localizedDescription }
                }
            }
        } message: {
            Text(wish.title)
        }
        .rollappError($error)
    }

    private func fulfill() {
        Task {
            do { try await store.fulfill(wish) }
            catch { self.error = error.localizedDescription }
        }
    }
}

enum WishlistEditorRoute: Identifiable {
    case wish(RollappWish?, WishSpace, WishListInfo?)
    case list(WishListInfo?, WishSpace)
    case profile
    case friends
    case web(InAppPage)
    case publicProfile(String, WishSpace)

    var id: String {
        switch self {
        case let .wish(wish, _, _): "wish/" + (wish?.id ?? "new")
        case let .list(list, _): "list/" + (list?.id ?? "new")
        case .profile: "profile"
        case .friends: "friends"
        case let .web(page): "web/" + page.id.absoluteString
        case let .publicProfile(address, space): "profile/" + address + "/" + space.rawValue
        }
    }
}

struct WishForm: View {
    @EnvironmentObject private var store: RollappStore
    let wish: RollappWish?
    let list: WishListInfo?
    @State private var space: WishSpace
    @State private var title: String
    @State private var description: String
    @State private var url: String
    @State private var price: String
    @State private var currency: String
    @State private var privateWish: Bool
    @State private var selectedLists: Set<String>

    init(wish: RollappWish?, space: WishSpace, list: WishListInfo?) {
        self.wish = wish
        self.list = list
        _space = State(initialValue: space)
        _title = State(initialValue: wish?.title ?? "")
        _description = State(initialValue: wish?.description ?? "")
        _url = State(initialValue: wish?.url ?? "")
        _price = State(initialValue: wish?.price.map { String($0) } ?? "")
        _currency = State(initialValue: wish?.currency ?? "RUB")
        _privateWish = State(initialValue: wish?.privacy == "private")
        _selectedLists = State(initialValue: Set(wish?.listIds ?? list.map { [$0.id] } ?? []))
    }

    var body: some View {
        RollappForm(title: wish == nil ? "Новое желание" : "Редактировать желание",
                    saveLabel: wish == nil ? "Загадать желание" : "Обновить", valid: !title.trimmed.isEmpty) {
            Section("Желание") {
                TextField("Название", text: $title, axis: .vertical).lineLimit(1...3)
                TextField("Описание", text: $description, axis: .vertical).lineLimit(3...6)
                TextField("Ссылка", text: $url).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
            }
            Section("Стоимость") {
                TextField("Цена", text: $price).keyboardType(.decimalPad)
                Picker("Валюта", selection: $currency) {
                    ForEach(["RUB", "USD", "EUR", "KZT", "BYN"], id: \.self) { Text($0) }
                }
            }
            Section {
                if wish == nil && list == nil {
                    Picker("Раздел", selection: $space) {
                        ForEach(WishSpace.allCases) { Text($0.title).tag($0) }
                    }
                }
                Toggle("Секретное желание", isOn: $privateWish)
            }
            let lists = (store.board?.lists ?? []).filter { !$0.isGeneral && ($0.category == space || selectedLists.contains($0.id)) }
            if !lists.isEmpty {
                Section("Списки") {
                    ForEach(lists) { item in
                        Toggle(item.title, isOn: Binding(
                            get: { selectedLists.contains(item.id) },
                            set: { value in
                                if value { selectedLists.insert(item.id) } else { selectedLists.remove(item.id) }
                            }
                        ))
                    }
                }
            }
        } save: {
            let link = url.trimmed
            guard title.trimmed.count <= 160, description.trimmed.count <= 1000, link.count <= 2000 else {
                throw RollappAPIError.response(400, "Проверьте длину названия, описания и ссылки.")
            }
            guard link.isEmpty || link == wish?.url || RollappURL.link(link, allowHTTP: true) != nil else {
                throw RollappAPIError.response(400, "Введите ссылку, начиная с https:// или http://.")
            }
            let amount = Double(price.trimmed.replacingOccurrences(of: ",", with: "."))
            guard price.trimmed.isEmpty || amount.map({ (0...999999999).contains($0) }) == true else {
                throw RollappAPIError.response(400, "Проверьте цену.")
            }
            try await store.saveWish(
                WishDraft(title: title.trimmed, description: description.trimmed, url: link, price: amount,
                          currency: currency, privacy: privateWish ? "private" : "inherit",
                          space: wish == nil ? space.rawValue : nil,
                          listIds: wish == nil || selectedLists != Set(wish?.listIds ?? []) ? selectedLists.sorted() : nil),
                id: wish?.id
            )
        }
    }
}

struct WishListForm: View {
    @EnvironmentObject private var store: RollappStore
    let list: WishListInfo?
    let space: WishSpace
    let didSave: (WishListInfo) -> Void
    @State private var title: String
    @State private var description: String
    @State private var privacy: String

    init(list: WishListInfo?, space: WishSpace, didSave: @escaping (WishListInfo) -> Void) {
        self.list = list
        self.space = space
        self.didSave = didSave
        _title = State(initialValue: list?.title ?? "")
        _description = State(initialValue: list?.description ?? "")
        _privacy = State(initialValue: list?.privacy ?? "public")
    }

    var body: some View {
        RollappForm(title: list == nil ? "Новый список" : "Настройки списка", valid: !title.trimmed.isEmpty) {
            TextField("Название", text: $title)
            TextField("Описание", text: $description, axis: .vertical).lineLimit(2...6)
            Picker("Кто видит список", selection: $privacy) {
                Text("Все").tag("public")
                Text("Подписчики").tag("followers")
                Text("По ссылке").tag("link")
                Text("Только я").tag("private")
            }
        } save: {
            guard title.trimmed.count <= 80, description.trimmed.count <= 300 else {
                throw RollappAPIError.response(400, "Проверьте длину названия и описания.")
            }
            let saved = try await store.saveList(.init(title: title.trimmed, description: description.trimmed,
                                                       privacy: privacy, space: list == nil ? space.rawValue : nil), id: list?.id)
            didSave(saved)
        }
    }
}

private struct RollappForm<Fields: View>: View {
    @EnvironmentObject private var store: RollappStore
    @Environment(\.dismiss) private var dismiss
    let title: String
    var saveLabel = "Сохранить"
    let valid: Bool
    @ViewBuilder let fields: () -> Fields
    let save: () async throws -> Void
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form { fields() }
                .font(RollappStyle.font(18))
                .scrollContentBackground(.hidden)
                .background(RollappStyle.background)
                .navigationTitle(title)
                .navigationBarTitleDisplayMode(.inline)
                .safeAreaInset(edge: .bottom) {
                    HStack(spacing: 8) {
                        Button { dismiss() } label: { RollappControl(symbol: "chevron.left") }
                            .accessibilityLabel("Назад")
                            .disabled(store.isSaving)
                        Button {
                            Task {
                                do { try await save(); dismiss() }
                                catch { self.error = error.localizedDescription }
                            }
                        } label: {
                            Text(store.isSaving ? "Сохраняем…" : saveLabel)
                                .font(RollappStyle.font(18, weight: 500))
                                .frame(maxWidth: .infinity, minHeight: 48)
                                .foregroundStyle(saveEnabled ? RollappStyle.card : RollappStyle.muted)
                                .background(saveEnabled ? RollappStyle.primary : RollappStyle.secondary, in: Capsule())
                        }
                        .disabled(!saveEnabled)
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)
                    .background(RollappStyle.background)
                }
                .rollappError($error)
        }
        .interactiveDismissDisabled(store.isSaving)
    }

    private var saveEnabled: Bool { valid && !store.isSaving && !store.isRefreshing }
}

extension View {
    func rollappError(_ error: Binding<String?>) -> some View {
        alert("Rollapp", isPresented: Binding(get: { error.wrappedValue != nil }, set: { if !$0 { error.wrappedValue = nil } })) {
            Button("ОК", role: .cancel) {}
        } message: {
            Text(error.wrappedValue ?? "")
        }
    }
}
