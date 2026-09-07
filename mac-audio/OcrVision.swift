// OCR helper for macOS using the built-in Vision framework — no tesseract
// needed. Usage: ocr <image.png> [language-code]   (e.g. en-US, de-DE)
// Prints the recognised text lines to stdout, top to bottom.
// Built by mac-audio/build.sh alongside the system-audio helper.

import Foundation
import Vision
import AppKit

let args = CommandLine.arguments
guard args.count >= 2 else {
  FileHandle.standardError.write("usage: ocr <image> [language]\n".data(using: .utf8)!)
  exit(64)
}
guard let image = NSImage(contentsOfFile: args[1]),
      let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
  FileHandle.standardError.write("error: cannot read image \(args[1])\n".data(using: .utf8)!)
  exit(1)
}

let request = VNRecognizeTextRequest { req, err in
  if let err = err {
    FileHandle.standardError.write("error: \(err.localizedDescription)\n".data(using: .utf8)!)
    exit(2)
  }
  let results = (req.results as? [VNRecognizedTextObservation]) ?? []
  // Vision returns observations in no guaranteed order; sort by position
  // (top of the image first, then left to right).
  let sorted = results.sorted {
    let a = $0.boundingBox, b = $1.boundingBox
    if abs(a.midY - b.midY) > 0.01 { return a.midY > b.midY }
    return a.minX < b.minX
  }
  let lines = sorted.compactMap { $0.topCandidates(1).first?.string }
  print(lines.joined(separator: "\n"))
  exit(0)
}
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
if args.count >= 3, #available(macOS 11.0, *) {
  request.recognitionLanguages = [args[2]]
}

let handler = VNImageRequestHandler(cgImage: cg, options: [:])
do {
  try handler.perform([request])
} catch {
  FileHandle.standardError.write("error: \(error.localizedDescription)\n".data(using: .utf8)!)
  exit(3)
}
RunLoop.main.run(until: Date(timeIntervalSinceNow: 30))
exit(4)
