// tools/matte/vision-matte.swift — маска человека и лицо по кадрам (задача 025).
// Компиляция (делает tools/matte/matte.mjs): swiftc -O -o out/bin/vision-matte tools/matte/vision-matte.swift
//
// Режимы:
//   segment --in <video> --out <dir> [--from S] [--to S] [--fps F] [--work 360x640] [--jobs 4] [--no-mask] [--no-face]
//       кадры через AVAssetReader (с поворотом по метаданным) → Vision VNGeneratePersonSegmentationRequest (.accurate,
//       OneComponent8) → crop 9:16 (cover) → рабочий размер → <dir>/raw.y8 (uint8, W×H на кадр, без заголовка);
//       VNDetectFaceRectanglesRequest на каждом кадре → <dir>/faces.raw.json (сырые прямоугольники в 1080×1920).
//   smooth --raw <raw.y8> --faces <faces.raw.json> --work 360x640 --out 1080x1920 --face-out <face.json>
//          [--thr 0.35,0.65 | --no-thr] [--dilate 31 | --no-grow] [--grow-min 0.005] [--blend 0.3] [--blur 1.4] [--none-after N]
//       сглаживание во времени по рецепту EFFECTS_PANTRY §J (общее для Vision и RVM — одна реализация, Accelerate,
//       без Python в основном пути): порог smoothstep → рост только в пределах dilate прошлой маски → ушедшее не тянется →
//       смесь blend прошлого / (1−blend) текущего → апскейл → gaussian blur. Кадры 1080×1920 gray → stdout (для ffmpeg).
//       Лицо: прямоугольник Vision, иначе по силуэту (макушка + ширина головы над плечами), иначе hold; сглаживание 0.7/0.3;
//       маска пуста (< 0,5 % кадра) дольше 0,5 с → source none, cx/cy/w null (лицо не висит без человека).
import Foundation
import AVFoundation
import Vision
import Accelerate
import CoreVideo

// ---------------------------------------------------------------- args
let argv = CommandLine.arguments
func opt(_ name: String) -> String? {
  guard let i = argv.firstIndex(of: name), i + 1 < argv.count else { return nil }
  return argv[i + 1]
}
func flag(_ name: String) -> Bool { argv.contains(name) }
func die(_ msg: String) -> Never {
  FileHandle.standardError.write(("vision-matte: " + msg + "\n").data(using: .utf8)!)
  exit(1)
}
func log(_ msg: String) { FileHandle.standardError.write((msg + "\n").data(using: .utf8)!) }
func parseSize(_ s: String?, _ def: (Int, Int)) -> (Int, Int) {
  guard let s = s else { return def }
  let p = s.split(separator: "x").compactMap { Int($0) }
  guard p.count == 2, p[0] > 0, p[1] > 0 else { die("размер «\(s)»: ожидаю WxH") }
  return (p[0], p[1])
}
guard argv.count >= 2 else { die("режим: segment | smooth") }
let mode = argv[1]

// ---------------------------------------------------------------- vImage helpers
final class Plane {
  let w: Int, h: Int
  var data: UnsafeMutablePointer<UInt8>
  init(_ w: Int, _ h: Int) { self.w = w; self.h = h; data = .allocate(capacity: w * h); data.initialize(repeating: 0, count: w * h) }
  deinit { data.deallocate() }
  var buf: vImage_Buffer { vImage_Buffer(data: data, height: vImagePixelCount(h), width: vImagePixelCount(w), rowBytes: w) }
}
func scale(_ src: vImage_Buffer, into dst: Plane) {
  var s = src, d = dst.buf
  let err = vImageScale_Planar8(&s, &d, nil, vImage_Flags(kvImageEdgeExtend))
  if err != kvImageNoError { die("vImageScale_Planar8: \(err)") }
}
/// dilate квадратом k×k (max-фильтр)
func dilate(_ src: Plane, into dst: Plane, k: Int) {
  var s = src.buf, d = dst.buf
  let err = vImageMax_Planar8(&s, &d, nil, 0, 0, vImagePixelCount(k), vImagePixelCount(k), vImage_Flags(kvImageEdgeExtend))
  if err != kvImageNoError { die("vImageMax_Planar8: \(err)") }
}
/// gaussian blur sigma px (разделимая свёртка 1×n и n×1)
func gaussian(_ src: Plane, tmp: Plane, into dst: Plane, sigma: Double) {
  if sigma <= 0 { memcpy(dst.data, src.data, src.w * src.h); return }
  let r = max(1, Int((sigma * 3).rounded(.up)))
  var kf = (-r...r).map { exp(-Double($0 * $0) / (2 * sigma * sigma)) }
  let sum = kf.reduce(0, +); kf = kf.map { $0 / sum }
  var k16 = kf.map { Int16(($0 * 4096).rounded()) }
  let div = Int32(k16.map { Int32($0) }.reduce(0, +))
  var s = src.buf, t = tmp.buf, d = dst.buf
  var e = vImageConvolve_Planar8(&s, &t, nil, 0, 0, &k16, 1, UInt32(2 * r + 1), div, 0, vImage_Flags(kvImageEdgeExtend))
  if e != kvImageNoError { die("vImageConvolve_Planar8 (h): \(e)") }
  e = vImageConvolve_Planar8(&t, &d, nil, 0, 0, &k16, UInt32(2 * r + 1), 1, div, 0, vImage_Flags(kvImageEdgeExtend))
  if e != kvImageNoError { die("vImageConvolve_Planar8 (v): \(e)") }
}
func cover916(_ w: Int, _ h: Int) -> (x: Int, y: Int, w: Int, h: Int) {
  // кроп «cover» под 9:16 по центру
  if w * 16 > h * 9 { let cw = h * 9 / 16; return ((w - cw) / 2, 0, cw, h) }
  let ch = w * 16 / 9; return (0, (h - ch) / 2, w, ch)
}

// ================================================================ segment
if mode == "segment" {
  guard let inPath = opt("--in"), let outDir = opt("--out") else { die("segment: нужны --in и --out") }
  let from = Double(opt("--from") ?? "0") ?? 0
  let to = opt("--to").flatMap { Double($0) }
  let (W, H) = parseSize(opt("--work"), (360, 640))
  let outW = 1080, outH = 1920
  let wantMask = !flag("--no-mask"), wantFace = !flag("--no-face")
  try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

  let asset = AVURLAsset(url: URL(fileURLWithPath: inPath))
  let tracks = try await asset.loadTracks(withMediaType: .video)
  guard let track = tracks.first else { die("в \(inPath) нет видеодорожки") }
  let nominal = try await track.load(.nominalFrameRate)
  let fps = Double(opt("--fps") ?? "") ?? Double(nominal)
  let comp = try await AVMutableVideoComposition.videoComposition(withPropertiesOf: asset) // применяет preferredTransform (поворот телефона)
  let srcW = Int(comp.renderSize.width.rounded()), srcH = Int(comp.renderSize.height.rounded())
  let crop = cover916(srcW, srcH)

  let reader = try AVAssetReader(asset: asset)
  let output = AVAssetReaderVideoCompositionOutput(videoTracks: tracks, videoSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
  output.videoComposition = comp
  output.alwaysCopiesSampleData = false
  reader.add(output)
  let start = CMTime(seconds: from, preferredTimescale: 60000)
  let dur = to.map { CMTime(seconds: $0 - from, preferredTimescale: 60000) } ?? .positiveInfinity
  reader.timeRange = CMTimeRange(start: start, duration: dur)
  guard reader.startReading() else { die("AVAssetReader: \(reader.error?.localizedDescription ?? "?")") }

  let jobs = max(1, Int(opt("--jobs") ?? "4") ?? 4)
  let probe = VNGeneratePersonSegmentationRequest(); probe.qualityLevel = .accurate
  let probeFace = VNDetectFaceRectanglesRequest()
  let segRevision = probe.revision, faceRevision = probeFace.revision

  let rawURL = URL(fileURLWithPath: outDir).appendingPathComponent("raw.y8")
  if wantMask { FileManager.default.createFile(atPath: rawURL.path, contents: nil) }
  let rawFH = wantMask ? try FileHandle(forWritingTo: rawURL) : nil
  var frames: [[String: Any]] = []
  var n = 0
  var maskW = 0, maskH = 0
  let t0 = Date()
  struct Job { let pb: CVPixelBuffer; let pts: Double }
  final class Res { var mask = Data(); var face: Any = NSNull(); var mw = 0; var mh = 0; var err: String? }
  let kx = Double(outW) / Double(crop.w), ky = Double(outH) / Double(crop.h)
  // кадры обрабатываются пачками по --jobs параллельно (Vision потокобезопасен; запросы — свои на кадр), запись — по порядку
  func process(_ batch: [Job]) throws {
    let results = batch.map { _ in Res() }
    DispatchQueue.concurrentPerform(iterations: batch.count) { i in
      let r = results[i]
      var reqs: [VNRequest] = []
      let seg = VNGeneratePersonSegmentationRequest(); seg.qualityLevel = .accurate; seg.outputPixelFormat = kCVPixelFormatType_OneComponent8
      let faceReq = VNDetectFaceRectanglesRequest()
      if wantMask { reqs.append(seg) }
      if wantFace { reqs.append(faceReq) }
      let handler = VNImageRequestHandler(cvPixelBuffer: batch[i].pb, orientation: .up, options: [:])
      do { try handler.perform(reqs) } catch { r.err = "\(error)"; return }
      if wantMask {
        guard let obs = seg.results?.first else { r.err = "нет результата сегментации"; return }
        let mpb = obs.pixelBuffer
        CVPixelBufferLockBaseAddress(mpb, .readOnly)
        let mw = CVPixelBufferGetWidth(mpb), mh = CVPixelBufferGetHeight(mpb), rb = CVPixelBufferGetBytesPerRow(mpb)
        r.mw = mw; r.mh = mh
        let base = CVPixelBufferGetBaseAddress(mpb)!.assumingMemoryBound(to: UInt8.self)
        let sx = Double(mw) / Double(srcW), sy = Double(mh) / Double(srcH)
        let cx0 = min(mw - 1, Int((Double(crop.x) * sx).rounded())), cy0 = min(mh - 1, Int((Double(crop.y) * sy).rounded()))
        let cw = max(1, min(mw - cx0, Int((Double(crop.w) * sx).rounded()))), ch = max(1, min(mh - cy0, Int((Double(crop.h) * sy).rounded())))
        let sub = vImage_Buffer(data: base + cy0 * rb + cx0, height: vImagePixelCount(ch), width: vImagePixelCount(cw), rowBytes: rb)
        let work = Plane(W, H)
        scale(sub, into: work)
        CVPixelBufferUnlockBaseAddress(mpb, .readOnly)
        r.mask = Data(bytes: work.data, count: W * H)
      }
      if wantFace, let faces = faceReq.results, !faces.isEmpty {
        let f = faces.max { $0.boundingBox.width * $0.boundingBox.height < $1.boundingBox.width * $1.boundingBox.height }!
        let bb = f.boundingBox
        let x = bb.minX * Double(srcW), yTop = (1 - bb.maxY) * Double(srcH), w = bb.width * Double(srcW), h = bb.height * Double(srcH)
        let ox = (x - Double(crop.x)) * kx, oy = (yTop - Double(crop.y)) * ky
        if ox + w * kx > 0 && ox < Double(outW) && oy + h * ky > 0 && oy < Double(outH) {
          r.face = ["cx": ((ox + w * kx / 2) * 10).rounded() / 10, "cy": ((oy + h * ky / 2) * 10).rounded() / 10, "w": ((w * kx) * 10).rounded() / 10, "h": ((h * ky) * 10).rounded() / 10, "conf": Double(f.confidence)]
        }
      }
    }
    for (i, r) in results.enumerated() {
      if let e = r.err { die("кадр \(n): \(e)") }
      if wantMask { rawFH!.write(r.mask); maskW = r.mw; maskH = r.mh }
      frames.append(["i": n, "t": (batch[i].pts * 10000).rounded() / 10000, "face": r.face])
      n += 1
    }
    if n % 60 < batch.count { log("  кадр \(n)…") }
  }
  var batch: [Job] = []
  while let sb = output.copyNextSampleBuffer() {
    guard let pb = CMSampleBufferGetImageBuffer(sb) else { continue }
    batch.append(Job(pb: pb, pts: CMSampleBufferGetPresentationTimeStamp(sb).seconds))
    if batch.count == jobs { try process(batch); batch.removeAll() }
  }
  if !batch.isEmpty { try process(batch) }
  if reader.status == .failed { die("чтение: \(reader.error?.localizedDescription ?? "?")") }
  try rawFH?.close()
  let sec = Date().timeIntervalSince(t0)
  let osv = ProcessInfo.processInfo.operatingSystemVersion
  let info: [String: Any] = [
    "engine": "vision", "mode": wantMask ? "mask+face" : "face",
    "visionRevision": segRevision, "faceRevision": faceRevision, "jobs": jobs,
    "macOS": "\(osv.majorVersion).\(osv.minorVersion).\(osv.patchVersion)",
    "quality": "accurate", "maskNative": [maskW, maskH],
    "src": ["w": srcW, "h": srcH, "nominalFps": Double(nominal)], "fps": fps,
    "crop": ["x": crop.x, "y": crop.y, "w": crop.w, "h": crop.h],
    "work": ["w": W, "h": H], "out": ["w": outW, "h": outH],
    "from": from, "to": to ?? NSNull(), "frames": n, "seconds": (sec * 100).rounded() / 100,
    "framesList": frames,
  ]
  let data = try JSONSerialization.data(withJSONObject: info, options: [.sortedKeys])
  try data.write(to: URL(fileURLWithPath: outDir).appendingPathComponent("faces.raw.json"))
  log("segment: \(n) кадров за \(String(format: "%.1f", sec)) с (\(String(format: "%.1f", Double(n) / max(sec, 1e-6))) к/с); маска \(maskW)×\(maskH) → \(W)×\(H); crop \(crop)")
  exit(0)
}

// ================================================================ smooth
if mode == "smooth" {
  guard let rawPath = opt("--raw"), let facesPath = opt("--faces"), let faceOut = opt("--face-out") else { die("smooth: нужны --raw, --faces, --face-out") }
  let (W, H) = parseSize(opt("--work"), (360, 640))
  let (OW, OH) = parseSize(opt("--out"), (1080, 1920))
  let useThr = !flag("--no-thr"), useGrow = !flag("--no-grow")
  let thr = (opt("--thr") ?? "0.35,0.65").split(separator: ",").compactMap { Double($0) }
  guard thr.count == 2, thr[1] > thr[0] else { die("--thr lo,hi") }
  let dil = Int(opt("--dilate") ?? "31") ?? 31
  let blend = Double(opt("--blend") ?? "0.3") ?? 0.3
  let blur = Double(opt("--blur") ?? "1.4") ?? 1.4
  let growMinArea = Double(opt("--grow-min") ?? "0.005") ?? 0.005 // доля кадра: меньше — ворота роста не применяются
  let emptyArea = 0.005 // маска «пуста», если площадь (> 127) меньше 0,5 % кадра
  let faceAlpha = 0.3 // новое лицо 0.3, прошлое 0.7

  let raw = try FileHandle(forReadingFrom: URL(fileURLWithPath: rawPath))
  let facesJSON = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: facesPath))) as! [String: Any]
  let list = facesJSON["framesList"] as! [[String: Any]]
  let fps = facesJSON["fps"] as! Double
  let fromSec = facesJSON["from"] as? Double ?? 0
  // лицо не висит без человека (025-Б п. 2): маска пуста дольше 0,5 с → source none, cx/cy/w null; --none-after N кадров (контроль)
  let noneAfter = Int(opt("--none-after") ?? "") ?? max(1, Int((0.5 * fps).rounded()))
  var emptyRun = 0

  let cur = Plane(W, H), prevBin = Plane(W, H), grow = Plane(W, H), outWork = Plane(W, H)
  let big = Plane(OW, OH), tmp = Plane(OW, OH), fin = Plane(OW, OH)
  var prev = [Float](repeating: 0, count: W * H)
  var curF = [Float](repeating: 0, count: W * H)
  let stdout = FileHandle.standardOutput
  var faceFrames: [[String: Any]] = []
  var fcx = 0.0, fcy = 0.0, fw = 0.0
  var haveFace = false
  let kx = Double(OW) / Double(W), ky = Double(OH) / Double(H)
  let lo = Float(thr[0]), hi = Float(thr[1])
  var n = 0
  while true {
    let chunk = raw.readData(ofLength: W * H)
    if chunk.count < W * H { break }
    chunk.copyBytes(to: cur.data, count: W * H)
    // 1. порог smoothstep
    for i in 0..<(W * H) {
      var v = Float(cur.data[i]) / 255
      if useThr { v = min(1, max(0, (v - lo) / (hi - lo))); v = v * v * (3 - 2 * v) }
      curF[i] = v
    }
    if n > 0 {
      // 2. рост только рядом с прошлой маской. Если прошлая маска (почти) пуста — человек вышел из кадра или была
      //    склейка — ворота открыты целиком, иначе маска никогда не вернётся (найдено на калибровке 025: после
      //    пустого кадра Vision оставался чёрным до конца ролика)
      if useGrow {
        var prevArea = 0
        for i in 0..<(W * H) { let b: UInt8 = prev[i] > 0.5 ? 255 : 0; prevBin.data[i] = b; if b != 0 { prevArea += 1 } }
        if Double(prevArea) >= growMinArea * Double(W * H) {
          dilate(prevBin, into: grow, k: dil)
          for i in 0..<(W * H) where grow.data[i] == 0 { curF[i] = 0 }
        }
      }
      // 3. смесь; ушедший кусок не тянется (там, где текущая 0, прошлое не подмешивается)
      let b = Float(blend)
      for i in 0..<(W * H) { curF[i] = curF[i] > 0 ? curF[i] * (1 - b) + prev[i] * b : 0 }
    }
    for i in 0..<(W * H) { outWork.data[i] = UInt8((curF[i] * 255).rounded()); prev[i] = curF[i] }
    // 4. апскейл + 5. blur
    scale(outWork.buf, into: big)
    gaussian(big, tmp: tmp, into: fin, sigma: blur)
    stdout.write(Data(bytesNoCopy: fin.data, count: OW * OH, deallocator: .none))

    // лицо
    let rec = n < list.count ? list[n] : [:]
    let t = (rec["t"] as? Double) ?? (fromSec + Double(n) / fps)
    var src = "hold"
    var ncx = 0.0, ncy = 0.0, nw = 0.0, found = false
    var maskArea = 0
    for i in 0..<(W * H) where outWork.data[i] > 127 { maskArea += 1 }
    let maskEmpty = Double(maskArea) < emptyArea * Double(W * H)
    if let f = rec["face"] as? [String: Any], let cx = f["cx"] as? Double, let cy = f["cy"] as? Double, let w = f["w"] as? Double {
      ncx = cx; ncy = cy; nw = w; found = true; src = "vision"
    } else if !maskEmpty { // силуэт только по настоящей маске (≥ 0,5 % кадра), не по пятнышкам
      // по силуэту: макушка + ширина головы над плечами (маска outWork, порог 0.5)
      var widths = [Int](repeating: 0, count: H), left = [Int](repeating: 0, count: H), right = [Int](repeating: 0, count: H)
      var top = -1
      for y in 0..<H {
        var l = -1, r = -1, c = 0
        for x in 0..<W where outWork.data[y * W + x] > 127 { if l < 0 { l = x }; r = x; c += 1 }
        widths[y] = c; left[y] = l; right[y] = r
        if top < 0 && c >= 3 { top = y }
      }
      if top >= 0 {
        let a = min(H - 1, top + Int(0.02 * Double(H))), bEnd = min(H - 1, top + Int(0.06 * Double(H)))
        let refRows = Array(widths[a...max(a, bEnd)]).sorted()
        let headRef = max(1, refRows[refRows.count / 2])
        var shoulder = min(H - 1, top + Int(0.25 * Double(H)))
        var y = bEnd + 1
        while y < min(H, top + Int(0.4 * Double(H))) { if Double(widths[y]) > 1.6 * Double(headRef) { shoulder = y; break }; y += 1 }
        let headH = max(4, shoulder - top)
        let mid = min(H - 1, top + headH / 2)
        var maxW = 0
        for yy in top...min(H - 1, shoulder) { maxW = max(maxW, widths[yy]) }
        if left[mid] >= 0 {
          ncx = Double(left[mid] + right[mid]) / 2 * kx
          ncy = (Double(top) + 0.55 * Double(headH)) * ky
          nw = Double(maxW) * 0.8 * kx
          found = true; src = "silhouette"
        }
      }
    }
    emptyRun = maskEmpty ? emptyRun + 1 : 0
    if found {
      if haveFace { fcx += (ncx - fcx) * faceAlpha; fcy += (ncy - fcy) * faceAlpha; fw += (nw - fw) * faceAlpha }
      else { fcx = ncx; fcy = ncy; fw = nw; haveFace = true }
    } else if !haveFace || emptyRun >= noneAfter { src = "none"; haveFace = false }
    if src == "none" {
      faceFrames.append(["t": ((t - fromSec) * 10000).rounded() / 10000, "cx": NSNull(), "cy": NSNull(), "w": NSNull(), "source": src])
    } else {
      faceFrames.append(["t": ((t - fromSec) * 10000).rounded() / 10000, "cx": (fcx * 10).rounded() / 10, "cy": (fcy * 10).rounded() / 10, "w": (fw * 10).rounded() / 10, "source": src])
    }
    n += 1
  }
  let faceDoc: [String: Any] = ["fps": fps, "from": fromSec, "frames": faceFrames, "smoothing": ["prev": 1 - faceAlpha, "new": faceAlpha], "coords": "1080x1920, cx/cy центр, w ширина (null при source none); t — секунды от начала отрезка (источник from + t)", "noneAfterFrames": noneAfter]
  try JSONSerialization.data(withJSONObject: faceDoc, options: [.sortedKeys]).write(to: URL(fileURLWithPath: faceOut))
  let srcCounts = Dictionary(grouping: faceFrames, by: { $0["source"] as! String }).mapValues { $0.count }
  log("smooth: \(n) кадров; thr=\(useThr ? "\(thr[0])..\(thr[1])" : "off") grow=\(useGrow ? "\(dil)" : "off") blend=\(blend) blur=\(blur); лицо: \(srcCounts)")
  exit(0)
}
die("неизвестный режим «\(mode)»: segment | smooth")
