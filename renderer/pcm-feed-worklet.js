// Turns raw mono Int16 PCM chunks (posted from the page) into an audio source,
// so system audio captured outside the renderer (macOS ScreenCaptureKit
// helper, 16 kHz) can be mixed into the same graph as microphone streams.
// The chunks are resampled to the context's own rate (processorOptions.inRate
// is theirs, 16000 by default): the transcription context runs at 16 kHz, but
// the recorder's and the supporter's run at 48 kHz, where samples played one
// for one would sound three times too fast with gaps between.
class PcmFeedProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const inRate = (options && options.processorOptions && options.processorOptions.inRate) || 16000;
    this.step = inRate / sampleRate; // input samples per output sample
    this.queue = [];
    this.offset = 0;
    this.a = 0;      // the input sample before the read position
    this.b = 0;      // the one after it
    this.frac = 1;   // position between a and b; 1 = take the next sample
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
  take() {
    while (this.queue.length) {
      const cur = this.queue[0];
      if (this.offset < cur.length) return cur[this.offset++] / 32768;
      this.queue.shift();
      this.offset = 0;
    }
    return null;
  }
  process(_inputs, outputs) {
    const out = outputs[0] && outputs[0][0];
    if (!out) return true;
    for (let i = 0; i < out.length; i++) {
      while (this.frac >= 1) {
        const s = this.take();
        if (s === null) break;
        this.a = this.b;
        this.b = s;
        this.frac -= 1;
      }
      if (this.frac >= 1) { out[i] = 0; continue; } // nothing has arrived yet: silence
      out[i] = this.a + (this.b - this.a) * this.frac;
      this.frac += this.step;
    }
    return true;
  }
}
registerProcessor("pcm-feed", PcmFeedProcessor);
