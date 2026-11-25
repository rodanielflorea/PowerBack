// Makes a recording seekable. Chrome's MediaRecorder writes a WebM with no
// duration, no seek index (Cues) and clusters of unknown size, so a player has
// to read from the start to find a point: clicking the timeline either does
// nothing or plays on from a frozen picture. This rewrites the file once, when
// the recording stops:
//   EBML header | Segment(known size) { SeekHead, Info(+Duration), Tracks,
//                 Clusters (known sizes), Cues }
// The clusters' bytes are copied as they are; only the frame around them is
// new. A file cut short by a crash is kept up to its last complete element.
// Any problem leaves the original file untouched.
const fs = require('fs');

const ID = {
  EBML: 0x1A45DFA3, Segment: 0x18538067, SeekHead: 0x114D9B74, Seek: 0x4DBB, SeekID: 0x53AB, SeekPosition: 0x53AC,
  Info: 0x1549A966, TimecodeScale: 0x2AD7B1, Duration: 0x4489, Tracks: 0x1654AE6B, TrackEntry: 0xAE,
  TrackNumber: 0xD7, TrackType: 0x83, CodecID: 0x86, ReferenceBlock: 0xFB, Cluster: 0x1F43B675, Timecode: 0xE7, SimpleBlock: 0xA3, BlockGroup: 0xA0,
  Block: 0xA1, Cues: 0x1C53BB6B, CuePoint: 0xBB, CueTime: 0xB3, CueTrackPositions: 0xB7, CueTrack: 0xF7,
  CueClusterPosition: 0xF1, Void: 0xEC,
};
// Elements that can only sit directly in the Segment: one of them ends a
// cluster of unknown size.
const TOP_LEVEL = new Set([ID.Cluster, ID.Cues, ID.SeekHead, ID.Info, ID.Tracks, 0x1254C367, 0x1941A469, 0x1043A770, ID.EBML, ID.Segment]);

// Reads the file through a window, so a recording of hours never sits in memory.
class Reader {
  constructor(fd, size) { this.fd = fd; this.size = size; this.buf = Buffer.alloc(0); this.at = 0; }
  async get(pos, n) {
    if (pos < 0 || pos + n > this.size) return null;
    if (pos < this.at || pos + n > this.at + this.buf.length) {
      const len = Math.min(Math.max(n, 4 << 20), this.size - pos);
      const b = Buffer.alloc(len);
      const { bytesRead } = await this.fd.read(b, 0, len, pos);
      this.buf = b.subarray(0, bytesRead); this.at = pos;
      if (bytesRead < n) return null;
    }
    return this.buf.subarray(pos - this.at, pos - this.at + n);
  }
  // An element header at pos: { id, size (null = unknown), data (start of the content) }.
  async header(pos) {
    const b = await this.get(pos, Math.min(12, this.size - pos));
    if (!b || !b.length) return null;
    const idLen = vintLength(b[0]);
    if (idLen < 1 || idLen > 4 || b.length < idLen + 1) return null;
    let id = 0;
    for (let i = 0; i < idLen; i++) id = id * 256 + b[i];
    const sLen = vintLength(b[idLen]);
    if (sLen < 1 || b.length < idLen + sLen) return null;
    let size = b[idLen] & (0xFF >> sLen);
    let allOnes = size === (0xFF >> sLen);
    for (let i = 1; i < sLen; i++) { size = size * 256 + b[idLen + i]; if (b[idLen + i] !== 0xFF) allOnes = false; }
    return { id, size: allOnes ? null : size, data: pos + idLen + sLen };
  }
}
function vintLength(first) { for (let i = 0; i < 8; i++) if (first & (0x80 >> i)) return i + 1; return 0; }
function readUint(b) { let v = 0; for (const x of b) v = v * 256 + x; return v; }

// ── Writing ──────────────────────────────────────────────────────────────────
function idBytes(id) { const out = []; let v = id; while (v > 0) { out.unshift(v & 0xFF); v = Math.floor(v / 256); } return Buffer.from(out); }
function size8(n) { const b = Buffer.alloc(8); b[0] = 0x01; let v = n; for (let i = 7; i >= 1; i--) { b[i] = v % 256; v = Math.floor(v / 256); } return b; }
function el(id, content) { return Buffer.concat([idBytes(id), size8(content.length), content]); }
function uint8(n) { const b = Buffer.alloc(8); let v = n; for (let i = 7; i >= 0; i--) { b[i] = v % 256; v = Math.floor(v / 256); } return b; }
function uint(id, n) { return el(id, uint8(n)); }

async function scan(r) {
  const ebml = await r.header(0);
  if (!ebml || ebml.id !== ID.EBML || ebml.size == null) throw new Error('not a WebM file');
  const seg = await r.header(ebml.data + ebml.size);
  if (!seg || seg.id !== ID.Segment) throw new Error('no segment');
  const out = { ebmlEnd: ebml.data + ebml.size, info: null, tracks: null, clusters: [], videoTrack: 0, videoCodec: '', scale: 1000000, end: 0 };
  const segEnd = seg.size == null ? r.size : Math.min(r.size, seg.data + seg.size);
  let pos = seg.data;
  while (pos < segEnd) {
    const h = await r.header(pos);
    if (!h) break;
    if (h.id === ID.Cluster) {
      const c = await scanCluster(r, h, segEnd, out);
      if (c.end <= h.data) break;
      out.clusters.push(c);
      pos = c.end;
      continue;
    }
    if (h.size == null || h.data + h.size > segEnd) break; // cut short
    if (h.id === ID.Info) out.info = { start: pos, data: h.data, end: h.data + h.size };
    else if (h.id === ID.Tracks) { out.tracks = { start: pos, end: h.data + h.size }; await scanTracks(r, h, out); }
    pos = h.data + h.size;
  }
  if (out.info) {
    for (let p = out.info.data; p < out.info.end;) {
      const h = await r.header(p);
      if (!h || h.size == null) break;
      if (h.id === ID.TimecodeScale) out.scale = readUint(await r.get(h.data, h.size)) || 1000000;
      p = h.data + h.size;
    }
  }
  return out;
}

async function scanTracks(r, tracks, out) {
  for (let p = tracks.data; p < tracks.data + tracks.size;) {
    const t = await r.header(p);
    if (!t || t.size == null) return;
    if (t.id === ID.TrackEntry) {
      let num = 0, type = 0, codec = '';
      for (let q = t.data; q < t.data + t.size;) {
        const f = await r.header(q);
        if (!f || f.size == null) break;
        if (f.id === ID.TrackNumber) num = readUint(await r.get(f.data, f.size));
        else if (f.id === ID.TrackType) type = readUint(await r.get(f.data, f.size));
        else if (f.id === ID.CodecID) codec = (await r.get(f.data, f.size)).toString('latin1');
        q = f.data + f.size;
      }
      if (type === 1 && !out.videoTrack) { out.videoTrack = num; out.videoCodec = codec; }
    }
    p = t.data + t.size;
  }
}

// One cluster: where its content ends, its time, and its first keyframe (video,
// or any block when there is no video) for the seek index.
async function scanCluster(r, h, segEnd, out) {
  const limit = h.size == null ? segEnd : Math.min(segEnd, h.data + h.size);
  const c = { data: h.data, end: h.data, cue: null };
  let time = 0;
  let p = h.data;
  while (p < limit) {
    const e = await r.header(p);
    if (!e) break;
    if (h.size == null && TOP_LEVEL.has(e.id)) break;
    if (e.size == null || e.data + e.size > limit) break; // cut short: keep what is whole
    if (e.id === ID.Timecode) time = readUint(await r.get(e.data, e.size));
    else if (e.id === ID.SimpleBlock || e.id === ID.BlockGroup) {
      // A BlockGroup (Chrome uses it for frames with extra data, such as an
      // alpha channel) has no keyframe flag: a ReferenceBlock in it means
      // "not a keyframe", and otherwise the frame itself says.
      let blk = e, referenced = false;
      if (e.id === ID.BlockGroup) {
        blk = null;
        for (let q = e.data; q < e.data + e.size;) {
          const f = await r.header(q);
          if (!f || f.size == null) break;
          if (f.id === ID.Block) blk = f;
          else if (f.id === ID.ReferenceBlock) referenced = true;
          q = f.data + f.size;
        }
      }
      const b = blk && await r.get(blk.data, Math.min(blk.size, 12));
      if (b && b.length >= 4) {
        const tl = vintLength(b[0]);
        const track = b[0] & (0xFF >> tl);
        if (b.length >= tl + 3) {
          const t = time + b.readInt16BE(tl);
          if (t > out.end) out.end = t;
          const key = e.id === ID.SimpleBlock ? !!(b[tl + 2] & 0x80)
            : !referenced && frameIsKey(out.videoCodec, track === out.videoTrack ? b[tl + 3] : undefined);
          const wanted = out.videoTrack ? track === out.videoTrack && key : true;
          if (!c.cue && wanted) c.cue = { time: Math.max(0, t), track };
        }
      }
    }
    p = e.data + e.size;
    c.end = p;
  }
  return c;
}

// What the first byte of a VP8 / VP9 frame says; true when it can't tell.
function frameIsKey(codec, first) {
  if (first === undefined) return true;
  if (codec === 'V_VP8') return (first & 0x01) === 0;
  if (codec === 'V_VP9') {
    const profile = ((first >> 5) & 1) | (((first >> 4) & 1) << 1);
    const bits = profile === 3 ? first << 1 : first; // profile 3 has a reserved bit
    return (bits & 0x08) === 0 && (bits & 0x04) === 0; // not show_existing_frame, frame_type key
  }
  return true;
}

async function copyRange(src, dst, from, to) {
  const piece = Buffer.alloc(1 << 20);
  for (let p = from; p < to;) {
    const n = Math.min(piece.length, to - p);
    const { bytesRead } = await src.read(piece, 0, n, p);
    if (!bytesRead) throw new Error('short read');
    await dst.write(piece, 0, bytesRead);
    p += bytesRead;
  }
}

// Returns { ok, duration (s), cues } or { ok: false, error }.
async function finalizeWebm(file) {
  let src = null, dst = null;
  const tmp = file + '.seekable';
  try {
    const st = await fs.promises.stat(file);
    src = await fs.promises.open(file, 'r');
    const r = new Reader(src, st.size);
    const s = await scan(r);
    if (!s.info || !s.tracks || !s.clusters.length) throw new Error('nothing to index');

    const ebmlHead = await r.get(0, s.ebmlEnd);
    const ebmlCopy = Buffer.from(ebmlHead);
    // Info without its old Duration (and Voids), plus the real one.
    const infoParts = [];
    for (let p = s.info.data; p < s.info.end;) {
      const h = await r.header(p);
      if (!h || h.size == null) break;
      if (h.id !== ID.Duration && h.id !== ID.Void) infoParts.push(Buffer.from(await r.get(p, h.data + h.size - p)));
      p = h.data + h.size;
    }
    const frameMs = s.videoTrack ? 1000 / 15 : 20;
    const durationUnits = s.end + frameMs * 1e6 / s.scale;
    const dur = Buffer.alloc(8); dur.writeDoubleBE(durationUnits);
    const info = el(ID.Info, Buffer.concat([...infoParts, el(ID.Duration, dur)]));
    const tracks = Buffer.from(await r.get(s.tracks.start, s.tracks.end - s.tracks.start));

    const seekHead = (infoAt, tracksAt, cuesAt) => el(ID.SeekHead, Buffer.concat([
      el(ID.Seek, Buffer.concat([el(ID.SeekID, idBytes(ID.Info)), uint(ID.SeekPosition, infoAt)])),
      el(ID.Seek, Buffer.concat([el(ID.SeekID, idBytes(ID.Tracks)), uint(ID.SeekPosition, tracksAt)])),
      el(ID.Seek, Buffer.concat([el(ID.SeekID, idBytes(ID.Cues)), uint(ID.SeekPosition, cuesAt)])),
    ]));
    const headLen = seekHead(0, 0, 0).length; // fixed-width numbers: the same for any positions
    const infoAt = headLen, tracksAt = infoAt + info.length;
    let at = tracksAt + tracks.length;
    const points = [];
    for (const c of s.clusters) {
      if (c.cue && (!points.length || c.cue.time > points[points.length - 1].time)) points.push({ ...c.cue, pos: at });
      at += 4 + 8 + (c.end - c.data); // Cluster ID + 8-byte size + content
    }
    const cuesAt = at;
    const cues = el(ID.Cues, Buffer.concat(points.map((q) => el(ID.CuePoint, Buffer.concat([
      uint(ID.CueTime, q.time),
      el(ID.CueTrackPositions, Buffer.concat([uint(ID.CueTrack, q.track), uint(ID.CueClusterPosition, q.pos)])),
    ])))));
    const segSize = cuesAt + cues.length;

    dst = await fs.promises.open(tmp, 'w');
    await dst.write(Buffer.concat([ebmlCopy, idBytes(ID.Segment), size8(segSize), seekHead(infoAt, tracksAt, cuesAt), info, tracks]));
    for (const c of s.clusters) {
      await dst.write(Buffer.concat([idBytes(ID.Cluster), size8(c.end - c.data)]));
      await copyRange(src, dst, c.data, c.end);
    }
    await dst.write(cues);
    await dst.close(); dst = null;
    await src.close(); src = null;
    const want = ebmlCopy.length + 4 + 8 + segSize;
    const got = (await fs.promises.stat(tmp)).size;
    if (got !== want) throw new Error(`size check failed (${got} != ${want})`);
    await fs.promises.rename(tmp, file);
    return { ok: true, duration: Math.round(durationUnits * s.scale / 1e9), cues: points.length };
  } catch (e) {
    try { if (dst) await dst.close(); } catch {}
    try { if (src) await src.close(); } catch {}
    try { await fs.promises.unlink(tmp); } catch {}
    return { ok: false, error: e.message };
  }
}

module.exports = { finalizeWebm };
