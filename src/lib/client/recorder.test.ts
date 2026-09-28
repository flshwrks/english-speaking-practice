import assert from "node:assert/strict";
import { test } from "node:test";
import { SAMPLE_RATE, toWav, trimSilence, UtteranceRecorder, voicedMs, voiceOnsetMs } from "./recorder";

/** 無音（小さなノイズ）と声（大きな正弦波）をつないだ 16kHz の PCM */
function signal(parts: [kind: "silence" | "voice", ms: number][]) {
  const out: number[] = [];
  for (const [kind, ms] of parts) {
    for (let i = 0; i < (ms / 1000) * SAMPLE_RATE; i++) {
      out.push(kind === "voice" ? Math.round(6000 * Math.sin(i / 5)) : ((i * 7919) % 61) - 30);
    }
  }
  return Int16Array.from(out);
}

test("voicedMs / voiceOnsetMs: 声のある時間と話し始め", () => {
  const pcm = signal([
    ["silence", 1000],
    ["voice", 800],
    ["silence", 500],
    ["voice", 400],
    ["silence", 300],
  ]);
  assert.ok(Math.abs(voicedMs(pcm) - 1200) <= 40);
  assert.ok(Math.abs(voiceOnsetMs(pcm)! - 1000) <= 20);
  assert.equal(voiceOnsetMs(signal([["silence", 1000]])), null);
});

test("trimSilence: 前後の無音を余白を残して削り、声がなければそのまま", () => {
  const pcm = signal([
    ["silence", 3000],
    ["voice", 1000],
    ["silence", 2000],
  ]);
  const trimmed = trimSilence(pcm);
  const ms = (trimmed.length / SAMPLE_RATE) * 1000;
  assert.ok(ms >= 1000 + 300 + 400 - 40 && ms <= 1000 + 300 + 400 + 40, `trimmed ${ms}ms`);
  const silent = signal([["silence", 500]]);
  assert.equal(trimSilence(silent), silent);
});

test("toWav: 16kHz mono 16bit のヘッダ", async () => {
  const buf = Buffer.from(await toWav(new Int16Array(100)).arrayBuffer());
  assert.equal(buf.length, 44 + 200);
  assert.equal(buf.toString("ascii", 0, 4), "RIFF");
  assert.equal(buf.readUInt32LE(24), SAMPLE_RATE);
});

test("リサンプリング: かたまりの境目で欠けたサンプル（0）が入らない", () => {
  for (const rate of [48000, 44100]) {
    // private のコンストラクタと push を直接使う（AudioContext なしで検証する）
    const Ctor = UtteranceRecorder as unknown as new (
      ctx: { sampleRate: number },
      node: unknown,
    ) => {
      push(x: Float32Array): void;
      position: number;
      slice(a: number, b: number): Int16Array;
    };
    const rec = new Ctor({ sampleRate: rate }, {});
    for (let k = 0; k < 50; k++) rec.push(new Float32Array(2048).fill(0.5));
    const pcm = rec.slice(0, rec.position);
    assert.ok(pcm.length > 0);
    assert.ok(
      pcm.every((v) => v === Math.round(0.5 * 0x7fff) || v === Math.floor(0.5 * 0x7fff)),
      `rate ${rate}`,
    );
    // 入力の長さぶん（±1）だけ書き込まれる
    assert.ok(Math.abs(pcm.length - (50 * 2048 * SAMPLE_RATE) / rate) <= 1);
  }
});
