// tools/matte/vision-face.swift — лица на отдельных картинках (кадр-источник вырезки, кадры живого плана) по Vision.
// Задача 030 (аутро MIA v4: рамки на лице `card.lock`, `lockCarry`). Тот же детектор, что в vision-matte.swift (задача 025):
// VNDetectFaceRectanglesRequest, без сглаживания во времени (картинки независимы).
// Компиляция (делает videos/mia-outro/prepare-v4.mjs): swiftc -O -o out/bin/vision-face tools/matte/vision-face.swift
//   vision-face <img> [<img> ...]  → stdout JSON: [{file, w, h, faces: [{x, y, w, h, conf}], hands: [...]}] — пиксели картинки,
//   начало слева сверху, по убыванию площади. Нет лица — faces: [] (решает вызывающий: громкий отказ или отчёт).
//   hands — рамка по суставам кисти (VNDetectHumanHandPoseRequest, точки с conf > 0.3): цель lockCarry ROOK, когда лица в кадре нет
//   (решение Олега 2026-11-06, задача 030).
import Foundation
import Vision
import ImageIO

func die(_ msg: String) -> Never {
  FileHandle.standardError.write(("vision-face: " + msg + "\n").data(using: .utf8)!)
  exit(1)
}
let files = Array(CommandLine.arguments.dropFirst())
if files.isEmpty { die("нужен хотя бы один файл картинки") }

var out: [[String: Any]] = []
for f in files {
  guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: f) as CFURL, nil),
        let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { die("не читается картинка \(f)") }
  let W = Double(img.width), H = Double(img.height)
  let req = VNDetectFaceRectanglesRequest()
  let hreq = VNDetectHumanHandPoseRequest()
  hreq.maximumHandCount = 2
  do { try VNImageRequestHandler(cgImage: img, options: [:]).perform([req, hreq]) } catch { die("Vision \(f): \(error)") }
  let hands = (hreq.results ?? []).compactMap { o -> [String: Double]? in
    guard let pts = try? o.recognizedPoints(.all) else { return nil }
    let ok = pts.values.filter { $0.confidence > 0.3 }
    if ok.count < 4 { return nil }
    let xs = ok.map { $0.location.x * W }, ys = ok.map { (1 - $0.location.y) * H }
    return ["x": xs.min()!.rounded(), "y": ys.min()!.rounded(), "w": (xs.max()! - xs.min()!).rounded(), "h": (ys.max()! - ys.min()!).rounded(), "conf": Double(o.confidence)]
  }.sorted { ($0["w"]! * $0["h"]!) > ($1["w"]! * $1["h"]!) }
  let faces = (req.results ?? [])
    .map { o -> [String: Double] in
      let b = o.boundingBox // нормированные, начало слева снизу
      return ["x": (b.minX * W).rounded(), "y": ((1 - b.maxY) * H).rounded(), "w": (b.width * W).rounded(), "h": (b.height * H).rounded(), "conf": Double(o.confidence)]
    }
    .sorted { ($0["w"]! * $0["h"]!) > ($1["w"]! * $1["h"]!) }
  out.append(["file": (f as NSString).lastPathComponent, "w": W, "h": H, "faces": faces, "hands": hands])
}
let data = try! JSONSerialization.data(withJSONObject: out, options: [.prettyPrinted, .sortedKeys])
FileHandle.standardOutput.write(data)
FileHandle.standardOutput.write("\n".data(using: .utf8)!)
