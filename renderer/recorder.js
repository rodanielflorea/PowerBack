// Session screen recorder: captures the screen with system audio + microphone
// mixed into one track, as a .webm. Auto-started with transcription. Each 2 s
// piece is written to disk as it is produced, so stopping costs nothing and a
// crash keeps the video so far; End moves the file into the session's folder.
// Loaded after renderer.js, which fans macOS system-audio PCM to
// window.__macRecSub.
(function () {
  const IS_MAC = /Mac/i.test(navigator.platform || "");
  let rec = null;          // MediaRecorder
  let recId = null;        // main's id for the file being written
  let writes = Promise.resolve();
  let ctx = null;          // AudioContext for mixing
  let tracks = [];         // every track/stream to stop at the end
  let active = false;
  let levelTimer = null;
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

  let mixDest = null;
  let sysTap = null;       // analyser on the system audio, to match the mic to it
  let micTap = null;
  let micGain = null;

  function tap(node) {
    const a = ctx.createAnalyser();
    a.fftSize = 2048;
    node.connect(a);
    return a;
  }

  async function addSystemAudio(cfg) {
    if (cfg.captureSystem === false) return;
    if (IS_MAC) {
      // The transcription pipeline already runs the helper; tap its PCM feed.
      try {
        await ctx.audioWorklet.addModule("pcm-feed-worklet.js");
        const feed = new AudioWorkletNode(ctx, "pcm-feed", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
        feed.connect(mixDest);
        sysTap = tap(feed);
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
      s.getVideoTracks().forEach((t) => t.stop());
      const at = s.getAudioTracks()[0];
      if (at) {
        const src = ctx.createMediaStreamSource(new MediaStream([at]));
        src.connect(mixDest);
        sysTap = tap(src);
        log("recording system audio: loopback");
      }
    } catch (e) { log("recording system audio (loopback) unavailable: " + e.message); }
  }

  // The microphone is always part of the recording, whatever is chosen for
  // transcription: the video is the record of both sides of the meeting.
  async function addMicAudio(cfg) {
    try {
      if (window.api.getMicPermission) {
        const perm = await window.api.getMicPermission();
        if (perm === "denied" || perm === "restricted") { log("recording microphone unavailable: access is blocked", "err"); return; }
      }
      const base = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 };
      const audio = cfg.micDeviceId ? { ...base, deviceId: { exact: cfg.micDeviceId } } : base;
      let s;
      try { s = await navigator.mediaDevices.getUserMedia({ audio, video: false }); }
      catch (e) {
        if (!cfg.micDeviceId) throw e;
        s = await navigator.mediaDevices.getUserMedia({ audio: base, video: false }); // the saved device is gone
      }
      tracks.push(s);
      const src = ctx.createMediaStreamSource(s);
      micGain = ctx.createGain();
      micGain.gain.value = 2;
      // The limiter keeps a raised voice from clipping once the gain is up.
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -6; limiter.knee.value = 6; limiter.ratio.value = 12;
      limiter.attack.value = 0.003; limiter.release.value = 0.25;
      src.connect(micGain).connect(limiter).connect(mixDest);
      micTap = tap(src);
      log("recording microphone");
    } catch (e) {
      log("recording microphone unavailable: " + e.message, "err");
      try { if (window.__recToast) window.__recToast("The microphone could not be recorded: " + e.message); } catch {}
    }
  }

  // Keep the microphone as loud as the meeting audio. Each side's speech level
  // is followed while that side is talking (silence is not counted), and the
  // mic gain moves slowly toward the ratio of the two.
  function startLevelMatch() {
    if (!micTap || !micGain) return;
    const buf = new Float32Array(2048);
    const rms = (a) => { a.getFloatTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return Math.sqrt(s / buf.length); };
    const FLOOR = 0.006;               // below this is room noise, not speech
    const TARGET = 0.08;               // used until the meeting side has spoken
    let mic = 0, sys = 0;
    levelTimer = setInterval(() => {
      if (!ctx || !micGain) return;
      const m = rms(micTap), s = sysTap ? rms(sysTap) : 0;
      if (m > FLOOR) mic = mic ? mic * 0.9 + m * 0.1 : m;
      if (s > FLOOR) sys = sys ? sys * 0.9 + s * 0.1 : s;
      if (!mic) return;
      const want = Math.max(0.5, Math.min(12, (sys || TARGET) / mic));
      const g = micGain.gain.value;
      micGain.gain.setTargetAtTime(g + (want - g) * 0.15, ctx.currentTime, 0.2);
    }, 250);
  }

  window.startRecording = async function startRecording(force) {
    if (active) return;
    let cfg = {};
    try { cfg = (await window.api.getTranscriptionConfig()) || {}; } catch {}
    if (!force && cfg.recordSession === false) return; // auto-record off; manual click still records
    active = true;
    tracks = [];
    try {
      const videoTrack = await getScreenVideoTrack();
      ctx = new AudioContext();
      mixDest = ctx.createMediaStreamDestination();
      await addSystemAudio(cfg);
      await addMicAudio(cfg);
      startLevelMatch();
      const audioTrack = mixDest.stream.getAudioTracks()[0];
      const streamTracks = [videoTrack];
      if (audioTrack) streamTracks.push(audioTrack);
      const begun = await window.api.recBegin();
      if (!begun || !begun.ok) throw new Error((begun && begun.error) || "the recording file could not be created");
      recId = begun.id;
      const id = recId;
      writes = Promise.resolve();
      rec = new MediaRecorder(new MediaStream(streamTracks), { mimeType: pickMime() });
      rec.ondataavailable = (e) => {
        if (!e.data || !e.data.size) return;
        // In order, one after another: the pieces only make a file in sequence.
        writes = writes.then(() => e.data.arrayBuffer()).then((b) => window.api.recChunk(id, b)).catch(() => {});
      };
      rec.start(2000);
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
    if (levelTimer) { clearInterval(levelTimer); levelTimer = null; }
    for (const s of tracks) { try { s.getTracks().forEach((t) => t.stop()); } catch {} }
    tracks = [];
    if (ctx) { try { ctx.close(); } catch {} ctx = null; }
    mixDest = null; sysTap = null; micTap = null; micGain = null;
    rec = null;
    recId = null;
  }

  // Close the file. It stays in the staging folder until End files it with
  // the rest of the session.
  window.stopRecording = function stopRecording() {
    if (!active) return Promise.resolve();
    active = false;
    const id = recId;
    return new Promise((resolve) => {
      const finish = async () => {
        try {
          await writes;
          const r = id && window.api.recEnd ? await window.api.recEnd(id) : null;
          if (r && r.ok) log("recording stopped; it will be saved with the session when you press End");
          else if (r) log("recording not saved: " + (r.error || "unknown"), "err");
        } catch (e) { log("recording save error: " + e.message, "err"); }
        cleanup();
        resolve();
      };
      if (rec && rec.state !== "inactive") { rec.onstop = finish; try { rec.stop(); } catch { finish(); } }
      else finish();
    });
  };

  window.isRecording = () => active;
})();
