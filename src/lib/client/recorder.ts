/**
 * マイク音声を 16kHz mono PCM のリングバッファに記録し、任意区間を WAV で切り出す。
 * Realtime API の VAD イベント（speech_started / stopped）に合わせて発話単位で切り出すのに使う。
 */
export const SAMPLE_RATE = 16000;
const RING_SECONDS = 120;

const WORKLET = `
class Tap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(2048); this.n = 0; }
  process(inputs) {
    const ch = inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i];
        if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice()); this.n = 0; }
      }
    }
    return true;
  }
}
registerProcessor("tap", Tap);`;

export class UtteranceRecorder {
  private ring = new Int16Array(SAMPLE_RATE * RING_SECONDS);
  /** これまでに書き込んだ総サンプル数（16kHz 換算, 単調増加） */
  private written = 0;
  private srcPos = 0;

  private constructor(private ctx: AudioContext) {}

  static async create(stream: MediaStream) {
    const ctx = new AudioContext();
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const rec = new UtteranceRecorder(ctx);
    const node = new AudioWorkletNode(ctx, "tap");
    node.port.onmessage = (e: MessageEvent<Float32Array>) => rec.push(e.data);
    ctx.createMediaStreamSource(stream).connect(node);
    return rec;
  }

  /** 入力サンプルレートから 16kHz へ線形補間でリサンプリングしてリングに書き込む */
  private push(input: Float32Array) {
    const step = this.ctx.sampleRate / SAMPLE_RATE;
    let pos = this.srcPos;
    while (pos < input.length - 1) {
      const i = Math.floor(pos);
      const v = input[i] + (input[i + 1] - input[i]) * (pos - i);
      this.ring[this.written % this.ring.length] = Math.max(-1, Math.min(1, v)) * 0x7fff;
      this.written++;
      pos += step;
    }
    this.srcPos = pos - input.length;
  }

  get position() {
    return this.written;
  }

  slice(from: number, to: number) {
    const start = Math.max(from, to - this.ring.length + 1, 0);
    const out = new Int16Array(Math.max(0, to - start));
    for (let i = 0; i < out.length; i++) out[i] = this.ring[(start + i) % this.ring.length];
    return out;
  }

  async close() {
    await this.ctx.close();
  }
}

export function toWav(pcm: Int16Array) {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + pcm.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, SAMPLE_RATE, true);
  v.setUint32(28, SAMPLE_RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return new Blob([buf], { type: "audio/wav" });
}
