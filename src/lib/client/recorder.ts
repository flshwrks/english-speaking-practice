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
  private prevSample = 0;
  /** 直近の入力音量（0〜1, 画面の音量メーター用） */
  private lastLevel = 0;
  private source: MediaStreamAudioSourceNode | null = null;

  private constructor(
    private ctx: AudioContext,
    private node: AudioWorkletNode,
  ) {}

  /**
   * ctx はタップ直後に同期で作ったものを渡せる（await の後で作ると iOS Safari などで停止状態のまま始まる）。
   * 渡さなければここで作る
   */
  static async create(stream: MediaStream, ctx = new AudioContext()) {
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const node = new AudioWorkletNode(ctx, "tap");
    // 出力は無音。出力先につないでおかないと処理を止めるブラウザがある
    node.connect(ctx.destination);
    const rec = new UtteranceRecorder(ctx, node);
    node.port.onmessage = (e: MessageEvent<Float32Array>) => rec.push(e.data);
    rec.attach(stream);
    await rec.resume();
    return rec;
  }

  /** 録音する入力を差し替える（マイクの抜き差しなどで取り直したとき）。位置は続きから数える */
  attach(stream: MediaStream) {
    this.source?.disconnect();
    this.source = this.ctx.createMediaStreamSource(stream);
    this.source.connect(this.node);
  }

  /**
   * 停止・中断状態なら再開を試みる（作成時・タブ復帰時・タップ時に呼ぶ）。
   * ユーザー操作の外では再開が保留されたまま終わらないことがあるので、待つのは最大 0.5 秒
   */
  async resume() {
    if (this.ctx.state === "running" || this.ctx.state === "closed") return;
    await Promise.race([this.ctx.resume().catch(() => {}), new Promise((ok) => setTimeout(ok, 500))]);
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
      // 位置が前のかたまりの最後と今回の先頭の間（i = -1）なら、前の最後のサンプルから補間する
      const a = i < 0 ? this.prevSample : input[i];
      const v = a + (input[i + 1] - a) * (pos - i);
      this.ring[this.written % this.ring.length] = Math.max(-1, Math.min(1, v)) * 0x7fff;
      this.written++;
      pos += step;
    }
    this.srcPos = pos - input.length;
    this.prevSample = input[input.length - 1];
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
    if (this.ctx.state !== "closed") await this.ctx.close();
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

const FRAME = SAMPLE_RATE / 50;
const FRAME_MS = 20;

/**
 * 20ms ごとに「声あり」かを判定する。その録音の静かな部分（下位20%）の3倍かつ一定以上なら声あり。
 * 手動で区切った発話は無音を含むため、実際に話した時間・話し始め・前後の無音の判定に使う
 */
function voicedFrames(pcm: Int16Array) {
  const rms: number[] = [];
  for (let i = 0; i + FRAME <= pcm.length; i += FRAME) {
    let sum = 0;
    for (let j = i; j < i + FRAME; j++) sum += pcm[j] * pcm[j];
    rms.push(Math.sqrt(sum / FRAME));
  }
  if (!rms.length) return [];
  const floor = [...rms].sort((a, b) => a - b)[Math.floor(rms.length * 0.2)];
  const threshold = Math.max(400, floor * 3);
  return rms.map((v) => v > threshold);
}

/** 実際に声が出ていた時間（ミリ秒）を音量から推定する（話速の計算に使う） */
export function voicedMs(pcm: Int16Array) {
  return voicedFrames(pcm).filter(Boolean).length * FRAME_MS;
}

/** 声が出始めた位置（ミリ秒）。クリック音などを拾わないよう、声ありが 60ms 続いた最初の位置。声がなければ null */
export function voiceOnsetMs(pcm: Int16Array) {
  const v = voicedFrames(pcm);
  for (let i = 0; i + 2 < v.length; i++) if (v[i] && v[i + 1] && v[i + 2]) return i * FRAME_MS;
  return null;
}

/**
 * 前後の無音を削る（発音評価は送った音声の長さで課金されるため）。子音の出だし・語尾を切らないよう前後に余白を残す。
 * 声が見つからなければそのまま返す
 */
export function trimSilence(pcm: Int16Array, padBeforeMs = 300, padAfterMs = 400) {
  const v = voicedFrames(pcm);
  const first = v.indexOf(true);
  if (first < 0) return pcm;
  const last = v.lastIndexOf(true);
  const from = Math.max(0, first * FRAME - (padBeforeMs / FRAME_MS) * FRAME);
  const to = Math.min(pcm.length, (last + 1) * FRAME + (padAfterMs / FRAME_MS) * FRAME);
  return pcm.subarray(from, to);
}
