import SwiftUI

@main
struct RollappApp: App {
    var body: some Scene {
        WindowGroup {
            RollappScreen()
                .tint(.primary)
                .environment(\.locale, Locale(identifier: "ru_RU"))
        }
    }
}

private struct RollappScreen: View {
    @StateObject private var store = RollappStore()
    @State private var showingSignIn = false

    private var isSignedIn: Bool {
        if case .signedIn = store.session { return true }
        return false
    }

    var body: some View {
        Group {
            switch store.session {
            case .checking:
                ProgressView("Открываем Rollapp…")
            case .signedOut:
                signInScreen
            case let .signedIn(account):
                WishlistScreen(account: account).id(account.id)
            case let .failed(message):
                ContentUnavailableView {
                    Label("Не удалось открыть Rollapp", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(message)
                } actions: {
                    Button("Повторить") { Task { await store.refresh() } }
                        .buttonStyle(.borderedProminent)
                        .disabled(store.isRefreshing)
                }
            }
        }
        .environmentObject(store)
        .task { await store.refresh() }
        .sheet(isPresented: $showingSignIn, onDismiss: checkSignIn) {
            RollappSignInScreen()
        }
        .onChange(of: isSignedIn) { _, signedIn in
            if signedIn { showingSignIn = false }
        }
    }

    private var signInScreen: some View {
        ContentUnavailableView {
            VStack(spacing: 16) {
                Image(systemName: "gift.fill")
                    .font(.system(size: 34, weight: .semibold))
                    .foregroundStyle(.tint)
                    .frame(width: 82, height: 82)
                    .background(.primary.opacity(0.12), in: .rect(cornerRadius: 26))
                    .accessibilityHidden(true)
                Text("Rollapp")
                    .font(.largeTitle.bold())
            }
        } description: {
            Text("Войдите, чтобы открыть свои списки и желания.")
        } actions: {
            if #available(iOS 26.0, *) {
                signInButton.buttonStyle(.glassProminent)
            } else {
                signInButton.buttonStyle(.borderedProminent)
            }
        }
    }

    private var signInButton: some View {
        Button("Войти с Яндекс ID") { showingSignIn = true }
            .controlSize(.large)
    }

    private func checkSignIn() {
        guard !isSignedIn else { return }
        Task { await store.refresh() }
    }
}

private struct RollappSignInScreen: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: RollappStore
    @StateObject private var session = RollappSession()
    @State private var checkingSignIn = false

    var body: some View {
        NavigationStack {
            ZStack {
                RollappWebView(session: session)
                    .opacity(session.state == .ready ? 1 : 0)
                    .accessibilityHidden(session.state != .ready)
                switch session.state {
                case .loading:
                    ProgressView("Загрузка…")
                case .ready:
                    EmptyView()
                case .verifying:
                    signInVerification
                case .unavailable:
                    ContentUnavailableView {
                        Label("Страница недоступна", systemImage: "wifi.exclamationmark")
                    } description: {
                        Text(session.problem ?? "Попробуйте открыть страницу снова.")
                    } actions: {
                        Button("Повторить", action: session.load)
                            .buttonStyle(.borderedProminent)
                    }
                }
            }
            .navigationTitle("Вход в Rollapp")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Закрыть", systemImage: "xmark") { dismiss() }
                }
            }
        }
        .onAppear(perform: session.start)
        .rollappError($session.linkProblem)
        .task(id: session.state) {
            if session.state == .verifying { await verifySignIn() }
        }
    }

    @ViewBuilder
    private var signInVerification: some View {
        if checkingSignIn || store.isRefreshing {
            ProgressView("Проверяем вход…")
        } else {
            switch store.session {
            case .checking, .signedIn:
                ProgressView("Проверяем вход…")
            case let .failed(message):
                ContentUnavailableView {
                    Label("Не удалось проверить вход", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(message)
                } actions: {
                    Button("Повторить") { Task { await verifySignIn() } }
                        .buttonStyle(.borderedProminent)
                }
            case .signedOut:
                ContentUnavailableView {
                    Label("Вход не подтверждён", systemImage: "person.crop.circle.badge.exclamationmark")
                } actions: {
                    Button("Войти ещё раз", action: session.load)
                        .buttonStyle(.borderedProminent)
                }
            }
        }
    }

    private func verifySignIn() async {
        checkingSignIn = true
        defer { checkingSignIn = false }
        await store.refresh()
    }
}
