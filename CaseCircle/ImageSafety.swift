import Foundation
import Vision
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif
#if canImport(CaseCircleCore)
import CaseCircleCore
#endif

enum ImageSafety {
    static func prepare(_ data: Data) async -> Result<Data, ImageRejection> {
        let jpeg = resizedJPEG(data) ?? data
        let text = await recognize(jpeg)
        if DocumentText.looksLikeDocument(text) || SafetyFilter.evaluate(text) != .allow {
            return .failure(.document)
        }
        return .success(jpeg)
    }

    private static func recognize(_ data: Data) async -> String {
        await Task.detached(priority: .userInitiated) {
            guard let cgImage = cgImage(from: data) else { return "" }
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .fast
            request.usesLanguageCorrection = false
            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
            try? handler.perform([request])
            return request.results?
                .compactMap { $0.topCandidates(1).first?.string }
                .joined(separator: " ") ?? ""
        }.value
    }

    private static func cgImage(from data: Data) -> CGImage? {
        #if canImport(UIKit)
        return UIImage(data: data)?.cgImage
        #elseif canImport(AppKit)
        guard let image = NSImage(data: data),
              let tiff = image.tiffRepresentation,
              let rep = NSBitmapImageRep(data: tiff) else { return nil }
        return rep.cgImage
        #else
        return nil
        #endif
    }

    private static func resizedJPEG(_ data: Data) -> Data? {
        #if canImport(UIKit)
        guard let image = UIImage(data: data) else { return nil }
        let maxSide: CGFloat = 1600
        let longest = max(image.size.width, image.size.height)
        let scale = longest > maxSide ? maxSide / longest : 1
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.jpegData(withCompressionQuality: 0.72) { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        #elseif canImport(AppKit)
        guard let image = NSImage(data: data) else { return nil }
        let maxSide: CGFloat = 1600
        let longest = max(image.size.width, image.size.height)
        guard longest > 0 else { return nil }
        let scale = longest > maxSide ? maxSide / longest : 1
        let size = NSSize(width: image.size.width * scale, height: image.size.height * scale)
        let rendered = NSImage(size: size)
        rendered.lockFocus()
        image.draw(in: NSRect(origin: .zero, size: size))
        rendered.unlockFocus()
        guard let tiff = rendered.tiffRepresentation,
              let rep = NSBitmapImageRep(data: tiff) else { return nil }
        return rep.representation(using: .jpeg, properties: [.compressionFactor: 0.72])
        #else
        return data
        #endif
    }
}

enum ImageRejection: Error {
    case document
}
