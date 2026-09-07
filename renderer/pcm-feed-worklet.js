// Turns raw 16 kHz mono Int16 PCM chunks (posted from the page) into an audio
// source, so system audio captured outside the renderer (macOS ScreenCaptureKit
// helper) can be mixed into the same destination as microphone streams.
class PcmFeedProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.offset = 0;
    this.port.onmessage = (e) => {
      const d = e.data;
      const u8 = d instanceof Uint8Array ? d : new Uint8Array(d);
      if (u8.byteLength < 2) return;
      const even = u8.byteLength & ~1;
      // Copy so alignment never matters.
      const i16 = new Int16Array(even / 2);
      i16.set(new Int16Array(u8.buffer.slice(u8.byteOffset, u8.byteOffset + even)));
      this.queue.push(i16);
      // Never let a stalled consumer grow the queue without bound (~5 s).
      if (this.queue.length > 100) { this.queue.splice(0, this.queue.length - 100); this.offset = 0; }
    };
  }
  process(_inputs, outputs) {
    const out = outputs[0] && outputs[0][0];
    if (!out) return true;
    let i = 0;
    while (i < out.length && this.queue.length) {
      const cur = this.queue[0];
      while (i < out.length && this.offset < cur.length) out[i++] = cur[this.offset++] / 32768;
      if (this.offset >= cur.length) { this.queue.shift(); this.offset = 0; }
    }
    for (; i < out.length; i++) out[i] = 0;
    return true;
  }
}
registerProcessor("pcm-feed", PcmFeedProcessor);
