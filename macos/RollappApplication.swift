import AppKit
import WebKit

@main
@MainActor
final class RollappApplication: NSObject, NSApplicationDelegate, NSMenuItemValidation {
    private let downloads = Downloads()
    private var primaryWindow: BrowserWindow?
    private var auxiliaryWindows: [NSWindow: BrowserWindow] = [:]

    private var currentWindow: BrowserWindow? {
        if let window = NSApp.keyWindow, let auxiliary = auxiliaryWindows[window] { return auxiliary }
        return primaryWindow
    }

    static func main() {
        let application = NSApplication.shared
        let delegate = RollappApplication()
        application.setActivationPolicy(.regular)
        application.delegate = delegate
        application.activate(ignoringOtherApps: true)
        withExtendedLifetime(delegate) { application.run() }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        installMenu()
        showMainWindow()
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows: Bool) -> Bool {
        if !hasVisibleWindows { showMainWindow() }
        return true
    }

    @objc private func showMainWindow() {
        if primaryWindow == nil {
            let configuration = WKWebViewConfiguration()
            configuration.websiteDataStore = .default()
            primaryWindow = makeWindow(configuration: configuration)
            primaryWindow?.window.setFrameAutosaveName("Rollapp Main Window")
            primaryWindow?.goHome()
        }
        primaryWindow?.show()
    }

    private func makeWindow(configuration: WKWebViewConfiguration, authenticating: Bool = false) -> BrowserWindow {
        let browser = BrowserWindow(configuration: configuration, downloads: downloads, authenticating: authenticating)
        browser.openWindow = { [unowned self] configuration, authenticating in
            let auxiliary = makeWindow(configuration: configuration, authenticating: authenticating)
            auxiliaryWindows[auxiliary.window] = auxiliary
            auxiliary.onClose = { [weak self, weak window = auxiliary.window] in
                if let window { self?.auxiliaryWindows.removeValue(forKey: window) }
            }
            auxiliary.show()
            return auxiliary.webView
        }
        return browser
    }

    @objc private func goHome() {
        showMainWindow()
        primaryWindow?.goHome()
    }

    @objc private func goBack() { currentWindow?.webView.goBack() }
    @objc private func goForward() { currentWindow?.webView.goForward() }
    @objc private func reloadPage() { currentWindow?.reload() }
    @objc private func openInBrowser() { currentWindow?.openInBrowser() }

    func validateMenuItem(_ menuItem: NSMenuItem) -> Bool {
        switch menuItem.action {
        case #selector(goBack): return currentWindow?.webView.canGoBack == true
        case #selector(goForward): return currentWindow?.webView.canGoForward == true
        case #selector(reloadPage), #selector(openInBrowser): return currentWindow?.window.isVisible == true
        default: return true
        }
    }

    private func installMenu() {
        let main = NSMenu()
        func menu(_ title: String) -> NSMenu {
            let item = NSMenuItem()
            let submenu = NSMenu(title: title)
            item.submenu = submenu
            main.addItem(item)
            return submenu
        }
        func command(_ menu: NSMenu, _ title: String, _ action: Selector, _ key: String = "", target: AnyObject? = nil,
                     modifiers: NSEvent.ModifierFlags = [.command]) {
            let item = menu.addItem(withTitle: title, action: action, keyEquivalent: key)
            item.target = target
            item.keyEquivalentModifierMask = modifiers
        }

        let app = menu("Rollapp")
        command(app, "О приложении Rollapp", #selector(NSApplication.orderFrontStandardAboutPanel(_:)))
        app.addItem(.separator())
        command(app, "Скрыть Rollapp", #selector(NSApplication.hide(_:)), "h")
        command(app, "Завершить Rollapp", #selector(NSApplication.terminate(_:)), "q")

        let file = menu("Файл")
        command(file, "Открыть окно Rollapp", #selector(showMainWindow), "n", target: self)
        command(file, "Открыть в браузере", #selector(openInBrowser), target: self)
        file.addItem(.separator())
        command(file, "Закрыть окно", #selector(NSWindow.performClose(_:)), "w")

        let edit = menu("Правка")
        command(edit, "Отменить", Selector(("undo:")), "z")
        command(edit, "Повторить", Selector(("redo:")), "z", modifiers: [.command, .shift])
        edit.addItem(.separator())
        command(edit, "Вырезать", #selector(NSText.cut(_:)), "x")
        command(edit, "Копировать", #selector(NSText.copy(_:)), "c")
        command(edit, "Вставить", #selector(NSText.paste(_:)), "v")
        command(edit, "Выбрать всё", #selector(NSText.selectAll(_:)), "a")

        let navigation = menu("Навигация")
        command(navigation, "Назад", #selector(goBack), "[", target: self)
        command(navigation, "Вперёд", #selector(goForward), "]", target: self)
        command(navigation, "Обновить страницу", #selector(reloadPage), "r", target: self)
        command(navigation, "Главная Rollapp", #selector(goHome), target: self)

        let windows = menu("Окно")
        command(windows, "Свернуть", #selector(NSWindow.performMiniaturize(_:)), "m")
        command(windows, "На весь экран", #selector(NSWindow.toggleFullScreen(_:)), "f", modifiers: [.command, .control])
        NSApp.windowsMenu = windows
        NSApp.mainMenu = main
    }
}
