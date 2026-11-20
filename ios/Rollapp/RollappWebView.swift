import SwiftUI
import WebKit

@MainActor
struct RollappWebView: UIViewRepresentable {
    let session: RollappSession

    func makeUIView(context: Context) -> WKWebView {
        session.webView
    }

    func updateUIView(_ view: WKWebView, context: Context) {}
}

struct InAppPage: Identifiable {
    let title: String
    let page: RollappSession.Page

    init(title: String, url: URL) {
        self.title = title
        self.page = .section(RollappURL.sectionEntry(url))
    }

    init(link url: URL) {
        title = url.host() ?? "Ссылка"
        page = RollappURL.isSection(url) ? .section(url) : .link(url)
    }

    var id: URL { page.url }
}

struct InAppWebScreen: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var session: RollappSession
    let destination: InAppPage

    init(_ destination: InAppPage) {
        self.destination = destination
        _session = StateObject(wrappedValue: RollappSession(page: destination.page))
    }

    var body: some View {
        NavigationStack {
            ZStack {
                RollappStyle.background.ignoresSafeArea()
                RollappWebView(session: session)
                    .opacity(session.state == .ready ? 1 : 0)
                    .accessibilityHidden(session.state != .ready)
                switch session.state {
                case .loading:
                    ProgressView("Загрузка…")
                case .unavailable:
                    ContentUnavailableView {
                        Label("Страница недоступна", systemImage: "exclamationmark.circle")
                    } description: {
                        Text(session.problem ?? "Попробуйте открыть страницу снова.")
                    } actions: {
                        Button("Повторить", action: session.load).buttonStyle(.bordered)
                    }
                case .ready, .verifying:
                    EmptyView()
                }
            }
            .navigationTitle(destination.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Закрыть", systemImage: "xmark") { dismiss() }
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button("Назад", systemImage: "chevron.left", action: session.goBack)
                        .disabled(!session.canGoBack)
                    Button("Обновить", systemImage: "arrow.clockwise", action: session.load)
                        .disabled(session.state == .loading)
                }
            }
        }
        .preferredColorScheme(.dark)
        .onAppear(perform: session.start)
        .sheet(item: $session.linkedPage) { destination in
            InAppWebScreen(destination)
        }
        .rollappError($session.linkProblem)
    }
}
