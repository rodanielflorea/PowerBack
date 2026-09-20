// Session screen recorder: captures the screen with system audio + microphone
// mixed into one track, as a .webm. Auto-started with transcription and saved
// to the user's Documents folder when the meeting ends. Loaded after
// renderer.js, which fans macOS system-audio PCM to window.__macRecSub.
(function () {
  const IS_MAC = /Mac/i.test(navigator.platform || "");
  let rec = null;          // MediaRecorder
  let chunks = [];
  let ctx = null;          // AudioContext for mixing
  let tracks = [];         // every track/stream to stop at the end
  let active = false;
  const log = (m, k) => { try { window.__recLog ? window.__recLog(m, k) : console.log("[rec]", m); } catch {} };

  function pickMime() {
    const c = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm;codecs=vp8", "video/webm"];
    for (const m of c) { try { if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m; } catch {} }
    return "video/webm";
  }

  async function getScreenVideoTrack() {
    const id = window.api.getDesktopSourceId ? await window.api.getDesktopSourceId() : null;
    if (!id) throw new Error("no screen source");
    const s = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: id, maxFrameRate: 15 } },
    });
    tracks.push(s);
    return s.getVideoTracks()[0];
  }

  // Returns { node|track } connected into the mix, or null.
  async function addSystemAudio(cfg) {
    if (cfg.captureSystem === false) return;
    if (IS_MAC) {
      // The transcription pipeline already runs the helper; tap its PCM feed.
      try {
        await ctx.audioWorklet.addModule("pcm-feed-worklet.js");
        const feed = new AudioWorkletNode(ctx, "pcm-feed", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
        feed.connect(mixDest);
        window.__macRecSub = (buf) => { try { feed.port.postMessage(buf); } catch {} };
        log("recording system audio: macOS helper");
      } catch (e) { log("recording system audio (mac) failed: " + e.message, "err"); }
      return;
    }
    // Windows: WASAPI loopback via desktop capture (audio only track).
    try {
      const id = await window.api.getDesktopSourceId();
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: id } },
        video: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: id, maxWidth: 1, maxHeight: 1, maxFrameRate: 1 } },
      });
      tracks.push(s);
      const at = s.getAudioTracks()[0];
      if (at) { ctx.createMediaStreamSource(new MediaStream([at])).connect(mixDest); log("recording system audio: loopback"); }
    } catch (e) { log("recording system audio (loopback) unavailable: " + e.message); }
  }

  async function addMicAudio(cfg) {
    if (cfg.captureMic === false) return;
    try {
      const audio = cfg.micDeviceId
        ? { deviceId: { exact: cfg.micDeviceId }, echoCancellation: true, noiseSuppression: true }
        : { echoCancellation: true, noiseSuppression: true };
      const s = await navigator.mediaDevices.getUserMedia({ audio, video: false });
      tracks.push(s);
      ctx.createMediaStreamSource(s).connect(mixDest);
      log("recording microphone");
    } catch (e) { log("recording microphone unavailable: " + e.message); }
  }

  let mixDest = null;

  window.startRecording = async function startRecording(force) {
    if (active) return;
    let cfg = {};
    try { cfg = (await window.api.getTranscriptionConfig()) || {}; } catch {}
    if (!force && cfg.recordSession === false) return; // auto-record off; manual click still records
    active = true;
    chunks = [];
    tracks = [];
    try {
      const videoTrack = await getScreenVideoTrack();
      ctx = new AudioContext();
      mixDest = ctx.createMediaStreamDestination();
      await addSystemAudio(cfg);
      await addMicAudio(cfg);
      const audioTrack = mixDest.stream.getAudioTracks()[0];
      const streamTracks = [videoTrack];
      if (audioTrack) streamTracks.push(audioTrack);
      const stream = new MediaStream(streamTracks);
      rec = new MediaRecorder(stream, { mimeType: pickMime() });
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.start(2000); // flush every 2s so a crash still leaves most of the file
      try { if (window.__recIndicator) window.__recIndicator(true); } catch {}
      log("recording started");
    } catch (e) {
      active = false;
      log("recording could not start: " + e.message, "err");
      try { if (window.__recToast) window.__recToast("Screen recording could not start: " + e.message); } catch {}
      cleanup();
    }
  };

  function cleanup() {
    try { if (window.__recIndicator) window.__recIndicator(false); } catch {}
    window.__macRecSub = null;
    for (const s of tracks) { try { s.getTracks().forEach((t) => t.stop()); } catch {} }
    tracks = [];
    if (ctx) { try { ctx.close(); } catch {} ctx = null; }
    mixDest = null;
    rec = null;
  }

  // Finalize the recording and save it. `baseName` seeds the filename.
  window.stopRecording = function stopRecording(baseName) {
    if (!active) return Promise.resolve();
    active = false;
    return new Promise((resolve) => {
      const finish = async () => {
        try {
          if (chunks.length && window.api.saveRecording) {
            const blob = new Blob(chunks, { type: "video/webm" });
            const buf = await blob.arrayBuffer();
            const r = await window.api.saveRecording(buf, baseName || "");
            if (r && r.ok) log("recording saved: " + r.path);
            else log("recording save failed: " + ((r && r.error) || "unknown"), "err");
            if (r && r.ok && window.__recToast) window.__recToast("Recording saved to " + r.path);
          }
        } catch (e) { log("recording save error: " + e.message, "err"); }
        chunks = [];
        cleanup();
        resolve();
      };
      if (rec && rec.state !== "inactive") { rec.onstop = finish; try { rec.stop(); } catch { finish(); } }
      else finish();
    });
  };

  window.isRecording = () => active;
})();
