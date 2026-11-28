import Foundation
import Vision
import AppKit

let args = CommandLine.arguments
guard args.count > 1 else {
  FileHandle.standardError.write("Usage: ocr.swift <image>\n".data(using: .utf8)!)
  exit(2)
}
let path = args[1]
guard let img = NSImage(contentsOfFile: path),
      let tiff = img.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let cg = bitmap.cgImage else {
  FileHandle.standardError.write("Could not load image\n".data(using: .utf8)!)
  exit(3)
}

let req = VNRecognizeTextRequest { (request, error) in
  guard let results = request.results as? [VNRecognizedTextObservation] else { return }
  for obs in results {
    if let candidate = obs.topCandidates(1).first {
      // include bbox so we can later detect bold via heuristics on letter geometry
      let bb = obs.boundingBox
      let line = String(format: "%.4f\t%.4f\t%.4f\t%.4f\t%@", bb.origin.x, bb.origin.y, bb.size.width, bb.size.height, candidate.string)
      print(line)
    }
  }
}
req.recognitionLanguages = ["en-US", "de-DE"]
req.recognitionLevel = .accurate
req.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cg, options: [:])
do {
  try handler.perform([req])
} catch {
  FileHandle.standardError.write("OCR error: \(error)\n".data(using: .utf8)!)
  exit(4)
}
