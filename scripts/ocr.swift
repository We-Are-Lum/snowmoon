// Read the text in an image with macOS's built-in Vision framework (no model
// download, no network). Used to check that lettering in a picture spells
// exactly what its lettering record says.
//
//   swift scripts/ocr.swift <image> [x y w h]   (optional crop, fractions of the image)
//
// Prints one JSON line per recognized string: {"text": ..., "confidence": ...}.
import Foundation
import Vision
import AppKit

let args = CommandLine.arguments
guard args.count >= 2, let image = NSImage(contentsOfFile: args[1]),
      var cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
  FileHandle.standardError.write("usage: swift scripts/ocr.swift <image> [x y w h]\n".data(using: .utf8)!)
  exit(2)
}
if args.count == 6, let x = Double(args[2]), let y = Double(args[3]), let w = Double(args[4]), let h = Double(args[5]) {
  let W = Double(cg.width), H = Double(cg.height)
  if let c = cg.cropping(to: CGRect(x: x * W, y: y * H, width: w * W, height: h * H)) { cg = c }
}
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false
try VNImageRequestHandler(cgImage: cg, options: [:]).perform([request])
for o in request.results ?? [] {
  if let t = o.topCandidates(1).first {
    let line = try JSONSerialization.data(withJSONObject: ["text": t.string, "confidence": t.confidence])
    print(String(data: line, encoding: .utf8)!)
  }
}
