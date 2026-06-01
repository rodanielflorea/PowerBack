class CaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.format = o.format === "int16" ? "int16" : "float32";
    this.batchSize = Math.max(128, (o.batchSize | 0) || 1600);
    this.buf = new Float32Array(this.batchSize);
    this.offset = 0;
  }

  flush() {
    if (this.offset === 0) return;
    if (this.format === "int16") {
      const out = new Int16Array(this.offset);
      for (let k = 0; k < this.offset; k++) {
        const s = Math.max(-1, Math.min(1, this.buf[k]));
        out[k] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.port.postMessage(out.buffer, [out.buffer]);
    } else {
      const out = new Float32Array(this.offset);
      out.set(this.buf.subarray(0, this.offset));
      this.port.postMessage(out.buffer, [out.buffer]);
    }
    this.offset = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const ch0 = input[0];
    if (!ch0) return true;
    let i = 0;
    while (i < ch0.length) {
      const space = this.batchSize - this.offset;
      const n = Math.min(space, ch0.length - i);
      this.buf.set(ch0.subarray(i, i + n), this.offset);
      this.offset += n;
      i += n;
      if (this.offset >= this.batchSize) this.flush();
    }
    return true;
  }
}

registerProcessor("capture-processor", CaptureProcessor);
