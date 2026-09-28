import assert from "node:assert/strict";
import { test } from "node:test";
import type { SessionMetrics } from "@/db/schema";
import { decideLevel, sessionScore } from "./adaptivity";

const m = (over: Partial<SessionMetrics> = {}): SessionMetrics => ({
  userWords: 400,
  speakingSec: 240,
  wpm: 100,
  lexicalDiversity: 0.4,
  errorsPer100Words: 3,
  accuracy: 85,
  fluency: 75,
  prosody: 70,
  pron: 80,
  estimatedCefr: "B2",
  ...over,
});
const easy = m({ wpm: 135, fluency: 88, errorsPer100Words: 1 });
const hard = m({ wpm: 70, fluency: 60, errorsPer100Words: 6 });

test("余裕度: 中立の指標は 0、余裕なら正、苦戦なら負。発話が少ない回は割り引く", () => {
  assert.equal(sessionScore(m()), 0);
  assert.ok(sessionScore(easy) > 0.8);
  assert.ok(sessionScore(hard) < -0.8);
  assert.equal(sessionScore(m({ ...easy, userWords: 30 })), 0);
  // 新しい指標があればそれを使う
  assert.ok(sessionScore(m({ errorFreeClauseRatio: 0.9, errorsPer100Words: 9 })) > 0);
  assert.ok(sessionScore(m({ medianLatencyMs: 3000, meanLengthOfRun: 2 })) < 0);
});

test("1回だけ良くても上げない（2回続けて・平均でも余裕なときだけ）", () => {
  assert.equal(decideLevel({ current: 5, suggestion: "up", recent: [easy, m()], isFirstEver: false }), 5);
  assert.equal(decideLevel({ current: 5, suggestion: "up", recent: [easy, easy], isFirstEver: false }), 6);
  assert.equal(decideLevel({ current: 5, suggestion: "keep", recent: [easy, easy, easy], isFirstEver: false }), 6);
});

test("AI が逆向きを判定した回は動かさない", () => {
  assert.equal(decideLevel({ current: 5, suggestion: "down", recent: [easy, easy, easy], isFirstEver: false }), 5);
  assert.equal(decideLevel({ current: 5, suggestion: "up", recent: [hard, hard, hard], isFirstEver: false }), 5);
});

test("苦戦が2回続けば下げる。1段ずつ、1〜10 に収める", () => {
  assert.equal(decideLevel({ current: 5, suggestion: "down", recent: [hard, hard], isFirstEver: false }), 4);
  assert.equal(decideLevel({ current: 1, suggestion: "down", recent: [hard, hard], isFirstEver: false }), 1);
  assert.equal(decideLevel({ current: 10, suggestion: "up", recent: [easy, easy], isFirstEver: false }), 10);
});

test("AI の判定だけが揺れても動かない（ランダムウォークにならない）", () => {
  for (const s of ["up", "down"] as const)
    assert.equal(decideLevel({ current: 5, suggestion: s, recent: [m(), m()], isFirstEver: false }), 5);
});

test("初回（レベル診断）は今回の結果で合わせる（はっきりしていれば ±2）", () => {
  assert.equal(decideLevel({ current: 6, suggestion: "down", recent: [hard], isFirstEver: true }), 4);
  assert.equal(decideLevel({ current: 6, suggestion: "keep", recent: [m()], isFirstEver: true }), 6);
  assert.equal(
    decideLevel({ current: 6, suggestion: "up", recent: [m({ wpm: 110, fluency: 80 })], isFirstEver: true }),
    7,
  );
  assert.equal(decideLevel({ current: 6, suggestion: "keep", recent: [], isFirstEver: true }), 6);
});

test("難易度を変えた直後の1回では動かさない（診断の ±2 は初回だけ）", () => {
  assert.equal(decideLevel({ current: 6, suggestion: "down", recent: [hard], isFirstEver: false }), 6);
  assert.equal(decideLevel({ current: 6, suggestion: "up", recent: [easy], isFirstEver: false }), 6);
});

test("実データ（2026-09-27 の2回）: 診断は B1・75wpm で据え置き寄り、2回目は余裕だが1回では上げない", () => {
  const diag = m({ wpm: 75, fluency: 77.8, prosody: 69.9, errorsPer100Words: 1.3, userWords: 553 });
  const second = m({ wpm: 118, fluency: 83.9, prosody: 71.2, errorsPer100Words: 1.3, userWords: 457 });
  assert.equal(decideLevel({ current: 6, suggestion: "keep", recent: [diag], isFirstEver: true }), 6);
  assert.equal(decideLevel({ current: 4, suggestion: "up", recent: [second, diag], isFirstEver: false }), 4);
  assert.equal(decideLevel({ current: 4, suggestion: "up", recent: [second, second, diag], isFirstEver: false }), 5);
});
