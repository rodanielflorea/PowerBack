// Screen watcher for speaker names. Runs in its own hidden window so reading
// the screen never blocks the app: each display is held as one low-rate capture
// stream (no capturer is built and torn down per read), a frame is taken twice
// a second, speaker-detect finds the framed tile, and only the result and a
// small picture of the name label go to the main process.
(function () {
  const { detectActiveTile, labelSignature } = self.SpeakerDetect;
  const TICK_MS = 500;
  const LABEL_EVERY_MS = 2500;   // resend a tile's label picture this often
  const LABEL_SCALE = 3;         // small print reads better enlarged
  const screens = [];            // { id, displayId, track, grabber, video, canvas, ctx }
  let busy = false, first = true, lastLabelKey = '', lastLabelAt = 0, lastHit = 0;

  async function open(src) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: src.id, maxFrameRate: 4 } },
    });
    const track = stream.getVideoTracks()[0];
    const video = document.createElement('video');
    video.muted = true;
    video.srcObject = stream;
    video.play().catch(() => {});
    const canvas = document.createElement('canvas');
    const s = { id: src.id, displayId: src.displayId, stream, track, video, canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }) };
    try { s.grabber = new ImageCapture(track); } catch {}
    screens.push(s);
  }

  // The current picture of a display on its canvas; false when none is ready.
  async function draw(s) {
    let src = null;
    if (s.grabber && s.track.readyState === 'live') {
      try { src = await s.grabber.grabFrame(); } catch {}
    }
    if (!src && s.video.readyState >= 2 && s.video.videoWidth) src = s.video;
    if (!src) return false;
    const w = src.width || src.videoWidth, h = src.height || src.videoHeight;
    if (!w || !h) return false;
    if (s.canvas.width !== w || s.canvas.height !== h) { s.canvas.width = w; s.canvas.height = h; }
    s.ctx.drawImage(src, 0, 0);
    if (src.close) src.close();
    return true;
  }

  async function png(s, r) {
    const c = new OffscreenCanvas(r.w * LABEL_SCALE, r.h * LABEL_SCALE);
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(s.canvas, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
    return new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
  }

  async function tick() {
    if (busy) return;
    busy = true;
    try {
      let best = null;
      const sizes = [];
      for (const s of screens) {
        if (!(await draw(s))) continue;
        const { width, height } = s.canvas;
        sizes.push(width + 'x' + height);
        const data = s.ctx.getImageData(0, 0, width, height).data;
        const img = { width, height, data, channels: 4, bgr: false };
        const det = detectActiveTile(img);
        if (det && (!best || det.tile.w * det.tile.h > best.det.tile.w * best.det.tile.h)) best = { det, s, img };
      }
      if (!sizes.length) return;
      const t = Date.now();
      if (first) {
        first = false;
        window.watch.log(`first screen read: ${sizes.length} display(s) ${sizes.join(', ')}; highlight: ${best ? best.det.platform : 'none'}`);
      }
      if (!best) { window.watch.observe({ t, det: null }); return; }
      lastHit = screens.indexOf(best.s);
      // Displays share one detection key space, so the platform carries the display.
      const det = { platform: best.det.platform + '@' + best.s.displayId, tile: best.det.tile };
      const key = det.platform + ':' + [det.tile.x, det.tile.y, det.tile.w, det.tile.h].map((v) => Math.round(v / 16)).join(',');
      const obs = { t, det, sig: labelSignature(best.img, best.det.label) };
      if (key !== lastLabelKey || t - lastLabelAt > LABEL_EVERY_MS) {
        obs.label = await png(best.s, best.det.label);
        lastLabelKey = key; lastLabelAt = t;
      }
      window.watch.observe(obs);
    } catch (e) {
      window.watch.log('screen read failed: ' + ((e && e.message) || e));
    } finally {
      busy = false;
    }
  }

  // The lower part of the meeting's display, where live captions are drawn.
  window.watch.onGrab(async (req) => {
    let jpeg = null;
    try {
      const s = screens[lastHit] || screens[0];
      if (s && (await draw(s))) {
        const { width, height } = s.canvas;
        const top = Math.round(height * 0.5), h = height - top;
        const k = Math.min(1, 1280 / width);
        const c = new OffscreenCanvas(Math.round(width * k), Math.round(h * k));
        c.getContext('2d').drawImage(s.canvas, 0, top, width, h, 0, 0, c.width, c.height);
        jpeg = new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: 0.8 })).arrayBuffer());
      }
    } catch (e) {
      window.watch.log('caption grab failed: ' + ((e && e.message) || e));
    }
    window.watch.grabbed(req.id, jpeg);
  });

  (async () => {
    let sources = [];
    try { sources = await window.watch.sources(); } catch (e) { window.watch.log('no screen sources: ' + ((e && e.message) || e)); }
    for (const src of sources) {
      try { await open(src); } catch (e) { window.watch.log(`display ${src.displayId} cannot be read: ` + ((e && e.message) || e)); }
    }
    if (!screens.length) { window.watch.log('no display could be opened; speaker names are off'); return; }
    setInterval(tick, TICK_MS);
    tick();
  })();
})();
