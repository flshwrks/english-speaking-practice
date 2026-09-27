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
  /** 直近の入力音量（0〜1, 画面の音量メーター用） */
  private lastLevel = 0;

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
    let sum = 0;
    for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
    // 話し声が 0.3〜0.8 程度に収まるよう、RMS を持ち上げて 0〜1 に丸める
    this.lastLevel = Math.min(1, Math.sqrt(sum / input.length) * 6);
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

  get level() {
    return this.lastLevel;
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

/**
 * 実際に声が出ていた時間（ミリ秒）を音量から推定する。手動で区切った発話は無音を含むため、話速の計算に使う。
 * 20ms ごとの音量が、その録音の静かな部分（下位20%）の3倍かつ一定以上なら「声あり」とみなす。
 */
export function voicedMs(pcm: Int16Array) {
  const frame = SAMPLE_RATE / 50;
  const rms: number[] = [];
  for (let i = 0; i + frame <= pcm.length; i += frame) {
    let sum = 0;
    for (let j = i; j < i + frame; j++) sum += pcm[j] * pcm[j];
    rms.push(Math.sqrt(sum / frame));
  }
  if (!rms.length) return 0;
  const floor = [...rms].sort((a, b) => a - b)[Math.floor(rms.length * 0.2)];
  const threshold = Math.max(400, floor * 3);
  return rms.filter((v) => v > threshold).length * 20;
}
