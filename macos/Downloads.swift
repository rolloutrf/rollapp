import AppKit
import WebKit

@MainActor
final class Downloads: NSObject, WKDownloadDelegate {
    private var active: [WKDownload: URL?] = [:]

    func track(_ download: WKDownload) {
        active.updateValue(nil, forKey: download)
        download.delegate = self
    }

    func download(
        _ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
        completionHandler: @escaping (URL?) -> Void
    ) {
        do {
            let files = FileManager.default
            let folder = try files.url(for: .downloadsDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            let filename = (suggestedFilename as NSString).lastPathComponent
                .components(separatedBy: .controlCharacters).joined()
            let safeName = ["", ".", "..", "/"].contains(filename) ? "Rollapp" : filename
            let ext = (safeName as NSString).pathExtension
            let stem = (safeName as NSString).deletingPathExtension
            let reserved = Set(active.values.compactMap { $0?.path.lowercased() })
            var destination = folder.appendingPathComponent(safeName)
            var suffix = 2
            while files.fileExists(atPath: destination.path) || reserved.contains(destination.path.lowercased()) {
                let name = "\(stem) \(suffix)" + (ext.isEmpty ? "" : ".\(ext)")
                destination = folder.appendingPathComponent(name)
                suffix += 1
            }
            active[download] = destination
            completionHandler(destination)
        } catch {
            active.removeValue(forKey: download)
            completionHandler(nil)
            showError()
        }
    }

    func downloadDidFinish(_ download: WKDownload) {
        active.removeValue(forKey: download)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        guard active.removeValue(forKey: download) != nil else { return }
        showError()
    }

    private func showError() {
        let alert = NSAlert()
        alert.messageText = "Не удалось скачать файл"
        alert.informativeText = "Проверьте папку «Загрузки» и попробуйте ещё раз."
        alert.addButton(withTitle: "ОК")
        if let window = NSApp.keyWindow {
            alert.beginSheetModal(for: window)
        } else {
            alert.runModal()
        }
    }
}
