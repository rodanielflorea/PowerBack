// System-audio capture helper for macOS 13+ (ScreenCaptureKit).
//
// Captures everything the Mac plays (the meeting audio), excluding this
// process, converts it to 16 kHz mono 16-bit PCM and writes the raw samples
// to stdout — the same format the app's audio worklet produces for Deepgram.
// Status lines go to stderr ("started", "error: …"). Exits when stdin closes.
//
// Built by mac-audio/build.sh (CI macOS runner or any Mac with Xcode tools).
// Requires the "Screen Recording" permission on macOS 13–14.3 and the
// "System Audio Recording Only" permission on macOS 14.4+; macOS prompts on
// first use, attributed to the app that launched this helper.

import Foundation
import AVFoundation
import CoreMedia
import ScreenCaptureKit

func status(_ s: String) {
  FileHandle.standardError.write((s + "\n").data(using: .utf8)!)
}

@available(macOS 13.0, *)
final class Capture: NSObject, SCStreamOutput, SCStreamDelegate {
  private var stream: SCStream?
  private var converter: AVAudioConverter?
  private var converterInput: AVAudioFormat?
  private let out = FileHandle.standardOutput
  private let target = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true)!
  private let queue = DispatchQueue(label: "system-audio")

  func start() async throws {
    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
    guard let display = content.displays.first else {
      throw NSError(domain: "system-audio", code: 1, userInfo: [NSLocalizedDescriptionKey: "no display"])
    }
    // Exclude the app that launched us (the parent process) so its own sounds
    // are never fed back into the transcript.
    let parent = getppid()
    let exclude = content.applications.filter { $0.processIdentifier == parent }
    let filter = SCContentFilter(display: display, excludingApplications: exclude, exceptingWindows: [])

    let cfg = SCStreamConfiguration()
    cfg.capturesAudio = true
    cfg.excludesCurrentProcessAudio = true
    cfg.sampleRate = 48000
    cfg.channelCount = 1
    // A video configuration is mandatory, but no video output is attached, so
    // nothing is rendered; keep it as small and slow as allowed.
    cfg.width = 2
    cfg.height = 2
    cfg.minimumFrameInterval = CMTime(value: 1, timescale: 1)
    cfg.showsCursor = false

    let s = SCStream(filter: filter, configuration: cfg, delegate: self)
    try s.addStreamOutput(self, type: .audio, sampleHandlerQueue: queue)
    try await s.startCapture()
    stream = s
  }

  func stop() async {
    guard let s = stream else { return }
    stream = nil
    try? await s.stopCapture()
  }

  func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
    guard type == .audio, sampleBuffer.isValid else { return }
    guard let fmtDesc = sampleBuffer.formatDescription,
          var asbd = CMAudioFormatDescriptionGetStreamBasicDescription(fmtDesc)?.pointee else { return }
    guard let srcFormat = AVAudioFormat(streamDescription: &asbd) else { return }
    let frames = AVAudioFrameCount(CMSampleBufferGetNumSamples(sampleBuffer))
    guard frames > 0, let pcm = AVAudioPCMBuffer(pcmFormat: srcFormat, frameCapacity: frames) else { return }
    pcm.frameLength = frames
    let copied = CMSampleBufferCopyPCMDataIntoAudioBufferList(sampleBuffer, at: 0, frameCount: Int32(frames), into: pcm.mutableAudioBufferList)
    guard copied == noErr else { return }

    if converter == nil || converterInput != srcFormat {
      converter = AVAudioConverter(from: srcFormat, to: target)
      converterInput = srcFormat
    }
    guard let conv = converter else { return }
    let ratio = target.sampleRate / srcFormat.sampleRate
    let capacity = AVAudioFrameCount(Double(frames) * ratio) + 64
    guard let outBuf = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: capacity) else { return }

    var consumed = false
    var convError: NSError?
    conv.convert(to: outBuf, error: &convError) { _, outStatus in
      if consumed { outStatus.pointee = .noDataNow; return nil }
      consumed = true
      outStatus.pointee = .haveData
      return pcm
    }
    if convError != nil { return }
    let bytes = Int(outBuf.frameLength) * MemoryLayout<Int16>.size
    guard bytes > 0, let samples = outBuf.int16ChannelData?[0] else { return }
    out.write(Data(bytes: samples, count: bytes))
  }

  func stream(_ stream: SCStream, didStopWithError error: Error) {
    status("error: stream stopped: \(error.localizedDescription)")
    exit(2)
  }
}

if #available(macOS 13.0, *) {
  let capture = Capture()
  Task {
    do {
      try await capture.start()
      status("started")
    } catch {
      status("error: \(error.localizedDescription)")
      exit(1)
    }
  }
  // The app closes our stdin to stop us.
  DispatchQueue.global().async {
    while readLine() != nil {}
    Task { await capture.stop(); exit(0) }
  }
  RunLoop.main.run()
} else {
  status("error: macOS 13 or newer is required for system audio capture")
  exit(3)
}
