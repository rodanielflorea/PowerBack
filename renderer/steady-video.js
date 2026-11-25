// A screen capture that keeps producing frames while the screen is still.
//
// macOS's screen capturer (ScreenCaptureKit) delivers a frame only when
// something on the screen changes. On a still screen nothing is sent, so:
//  - a supporter who joins (or whose decoder asks for a fresh picture) after
//    the last change gets no frame at all and sees black until something moves;
//  - a recording gets no frames, so no keyframes either, for as long as the
//    screen is still: a player cannot start at a clicked point there, and the
//    picture freezes.
// steadyVideoTrack(track) returns a track that passes every captured frame on
// and repeats the last one whenever none has come for idleMs. Stopping the
// returned track stops the capture under it; when the capture ends, the
// returned track ends too. Without the frame APIs it returns the track as is.
(function () {
  window.steadyVideoTrack = function steadyVideoTrack(track, opts) {
    const idleMs = (opts && opts.idleMs) || 500;
    if (!track || track.kind !== "video") return track;
    if (typeof MediaStreamTrackProcessor !== "function" || typeof MediaStreamTrackGenerator !== "function" || typeof VideoFrame !== "function") return track;
    let proc, gen, reader, writer;
    try {
      proc = new MediaStreamTrackProcessor({ track });
      gen = new MediaStreamTrackGenerator({ kind: "video" });
      reader = proc.readable.getReader();
      writer = gen.writable.getWriter();
    } catch { return track; }
    try { gen.contentHint = track.contentHint || "detail"; } catch {}

    let last = null;        // a copy of the newest captured frame, for repeats
    let lastTs = -1;        // timestamp (µs) of the newest frame written
    let lastWriteAt = 0;    // performance.now() of that write
    let pending = 0;        // writes not finished yet
    let done = false;
    let timer = null;

    // Timestamps must only go up: a repeat is stamped with the time since the
    // last write, and a captured frame that would go back is restamped.
    function emit(frame) {
      if (done || pending > 2) { frame.close(); return; } // the consumer is behind: skip
      let f = frame;
      if (f.timestamp <= lastTs) {
        try { f = new VideoFrame(frame, { timestamp: lastTs + 1 }); } catch { f = null; }
        frame.close();
        if (!f) return;
      }
      lastTs = f.timestamp;
      lastWriteAt = performance.now();
      pending++;
      writer.write(f).catch(() => { try { f.close(); } catch {} }).finally(() => { pending--; });
    }

    function repeat() {
      if (done || !last || performance.now() - lastWriteAt < idleMs) return;
      const ts = lastTs + Math.max(1, Math.round((performance.now() - lastWriteAt) * 1000));
      let copy;
      try { copy = new VideoFrame(last, { timestamp: ts }); } catch { return; }
      emit(copy);
    }

    function finish() {
      if (done) return;
      done = true;
      clearInterval(timer);
      if (last) { try { last.close(); } catch {} last = null; }
      try { reader.cancel(); } catch {}
      try { track.stop(); } catch {}
      const wasLive = gen.readyState === "live";
      try { writer.close().catch(() => {}); } catch {}
      if (wasLive) {
        stopGen();
        try { gen.dispatchEvent(new Event("ended")); } catch {}
      }
    }

    // The page stops the track it was given: stop the capture with it.
    const stopGen = gen.stop.bind(gen);
    gen.stop = () => { stopGen(); finish(); };

    (async () => {
      for (;;) {
        let r;
        try { r = await reader.read(); } catch { break; }
        if (r.done) break;
        const f = r.value;
        if (done) { f.close(); break; }
        if (last) last.close();
        try { last = f.clone(); } catch { last = null; }
        emit(f);
      }
      finish();
    })();
    timer = setInterval(repeat, Math.max(50, Math.round(idleMs / 2)));
    return gen;
  };
})();
