import SwiftUI
import WebKit

@main
struct RollappApp: App {
    var body: some Scene {
        WindowGroup {
            RollappScreen()
                .preferredColorScheme(.dark)
        }
    }
}

private struct RollappScreen: View {
    @StateObject private var session = RollappSession()

    var body: some View {
        ZStack {
            Color(white: 10.0 / 255).ignoresSafeArea()

            RollappWebView(webView: session.webView)
                .ignoresSafeArea()
                .opacity(session.state == .ready ? 1 : 0)
                .accessibilityHidden(session.state != .ready)

            switch session.state {
            case .loading:
                ProgressView("Загрузка Rollapp…")
            case .ready:
                EmptyView()
            case .unavailable:
                ContentUnavailableView {
                    Label("Не удалось открыть Rollapp", systemImage: "wifi.exclamationmark")
                } description: {
                    Text("Проверьте подключение к интернету и повторите попытку.")
                } actions: {
                    Button("Повторить", action: session.load)
                        .buttonStyle(.borderedProminent)
                        .buttonBorderShape(.capsule)
                        .controlSize(.large)
                }
            }
        }
        .onAppear(perform: session.start)
    }
}

private struct RollappWebView: UIViewRepresentable {
    let webView: WKWebView

    func makeUIView(context: Context) -> WKWebView { webView }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
