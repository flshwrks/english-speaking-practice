/**
 * src/lib/metrics.ts の単体テスト（DB・API を使わない）。
 * 使い方: npx tsx scripts/metrics-test.ts
 */
import assert from "node:assert/strict";
import type { SessionMetrics, WordAssessment } from "@/db/schema";
import {
  computeMetrics,
  delivery,
  isEcho,
  mattr,
  prune,
  rollingCefr,
  sessionCefr,
  timing,
  tokenize,
  weakSounds,
} from "@/lib/metrics";

const word = (w: string, offsetMs?: number, durationMs = 300, extra: Partial<WordAssessment> = {}): WordAssessment => ({
  word: w,
  accuracy: 90,
  errorType: "None",
  weakPhonemes: [],
  prosodyErrors: [],
  ...(offsetMs === undefined ? {} : { offsetMs, durationMs }),
  ...extra,
});

// つなぎ語と直後の繰り返し
const p = prune(tokenize("I I need need need to uh talk with talk with them um"));
assert.deepEqual(p.words, ["i", "need", "to", "talk", "with", "them"]);
assert.equal(p.fillers, 2);
assert.equal(p.repetitions, 4);

// MATTR: 同じ語の繰り返しは低く、すべて違う語なら 1。窓より短ければ素の TTR
assert.equal(mattr(["a", "b", "a", "b"]), 0.5);
assert.equal(mattr(Array.from({ length: 120 }, (_, i) => `w${i}`)), 1);
assert.ok(Math.abs(mattr(Array.from({ length: 120 }, (_, i) => `w${i % 10}`)) - 0.2) < 1e-9);

// 語の時刻: 250ms 以上の間だけをポーズに数える
const tm = timing([word("a", 0), word("b", 400), word("c", 1500)])!;
assert.equal(tm.spanMs, 1800);
assert.deepEqual(tm.pauses, [800]);
assert.equal(timing([word("a"), word("b")]), null);

// 話速はモードによらず Azure の語の時刻で測る（durationMs は使わない）。語数は聞き取った語から
const u = {
  transcript: "I think so",
  heard: "i i think so",
  durationMs: 99_000,
  accuracy: 90,
  fluency: 80,
  prosody: 70,
  pron: 80,
  words: [word("i", 0), word("i", 300), word("think", 600), word("so", 1500)],
};
const d = delivery([u], [{ latencyMs: 1000 }, { latencyMs: 4000 }, { latencyMs: 2000 }]);
assert.equal(d.spokenWords, 3);
assert.equal(d.speakingSec, 2); // 0〜1800ms
assert.equal(d.wpm, 100); // 3語 / 1.8秒
assert.equal(d.articulationWpm, 150); // 3語 / (1.8 - 0.6秒)
assert.equal(d.meanLengthOfRun, 1.5);
assert.equal(d.medianLatencyMs, 2000);
assert.equal(d.longLatencyRate, 0.33);
// 時刻のない古い発話は durationMs で
assert.equal(delivery([{ ...u, words: [] }]).speakingSec, 99);

// 語数で重み付けした平均: 1語の発話は30語の発話より軽い
const long = { ...u, fluency: 90, words: Array.from({ length: 30 }, (_, i) => word("x", i * 300)) };
const short = { ...u, fluency: 0, words: [word("yeah", 0)] };
const m = computeMetrics({
  utterances: [long, short],
  userTurns: [{ text: "one two three four" }],
  errorCounts: [{ errors: 2, clauses: 4, errorFreeClauses: 3 }],
  llmCefr: "B2",
  previous: [],
});
assert.equal(m.fluency, 87.1);
assert.equal(m.errorsPer100Words, 50);
assert.equal(m.errorFreeClauseRatio, 0.75);

// CEFR: 分析 AI の判定は実測の目安から ±1 段階まで。表示は直近の中央値（偶数個なら低いほう）
const base = { userWords: 200, wpm: 80, pron: 60, errorFreeClauseRatio: 0.3 } as SessionMetrics; // 実測は A2
assert.equal(sessionCefr("C1", base), "B1");
assert.equal(sessionCefr("A2", base), "A2");
assert.equal(rollingCefr("B2", ["B1"]), "B1");
assert.equal(rollingCefr("B2", ["B1", "B2"]), "B2");
assert.equal(rollingCefr("C1", ["B1", "B1", "B1", "B1", "C2"]), "B1");

// 苦手な音: 機能語は除き、50点未満が2回以上のものだけ
const weak = (w: string, score: number, heardAs?: string) =>
  word(w, undefined, 0, { weakPhonemes: [{ phoneme: "ɹ", score, ...(heardAs ? { heardAs } : {}) }] });
const sounds = weakSounds([weak("really", 30, "l"), weak("problem", 40, "l"), weak("are", 10), weak("right", 55)]);
assert.equal(sounds.length, 1);
assert.deepEqual(sounds[0], {
  phoneme: "ɹ",
  count: 3,
  clear: 2,
  heardAs: ["l"],
  examples: ["really", "problem", "right"],
});

// AI の声の拾い込み
assert.ok(
  isEcho(
    "So, could you elaborate on how you usually get input from everyone during the meeting?",
    "How do you usually get input from everyone during the meeting?",
  ),
);
assert.ok(!isEcho("I usually ask each person for their opinions one by one.", "How do you usually get input?"));

console.log("metrics: all tests passed");
