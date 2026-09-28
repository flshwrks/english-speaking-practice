import assert from "node:assert/strict";
import { test } from "node:test";
import { realtimeCostUsd, sessionLengths, sessionMinutes, settings, transcribeCostUsd } from "./config";

test("realtimeCostUsd: キャッシュ分は通常の入力から差し引いて安い単価で数える", () => {
  const usd = realtimeCostUsd({
    input_token_details: {
      text_tokens: 1_000_000,
      audio_tokens: 1_000_000,
      cached_tokens_details: { text_tokens: 500_000, audio_tokens: 1_000_000 },
    },
    output_token_details: { text_tokens: 1_000_000, audio_tokens: 1_000_000 },
  });
  // text: 0.5M×0.6 + 0.5M×0.06 / audio: 0×10 + 1M×0.3 / out: 2.4 + 20
  assert.ok(Math.abs(usd - (0.3 + 0.03 + 0.3 + 2.4 + 20)) < 1e-9);
  assert.equal(realtimeCostUsd({}), 0);
});

test("transcribeCostUsd: usage があればトークン単価、なければ話した時間で概算", () => {
  assert.ok(Math.abs(transcribeCostUsd(60_000) - 0.006) < 1e-12);
  const u = { audioTokens: 1_000_000, textTokens: 1_000_000, outputTokens: 1_000_000, seconds: 60 };
  assert.ok(Math.abs(transcribeCostUsd(0, u) - (6 + 2.5 + 10 + 0.006)) < 1e-9);
  assert.ok(
    Math.abs(transcribeCostUsd(60_000, { audioTokens: 0, textTokens: 0, outputTokens: 0, seconds: 0 }) - 0.006) < 1e-12,
  );
});

test("settings: 数値でない環境変数は既定値（NaN で予算判定が壊れない）", () => {
  const prev = process.env.MONTHLY_BUDGET_JPY;
  process.env.MONTHLY_BUDGET_JPY = "abc";
  assert.equal(settings().monthlyBudgetJpy, 3000);
  process.env.MONTHLY_BUDGET_JPY = "-5";
  assert.equal(settings().monthlyBudgetJpy, 3000);
  process.env.MONTHLY_BUDGET_JPY = "5000";
  assert.equal(settings().monthlyBudgetJpy, 5000);
  if (prev === undefined) delete process.env.MONTHLY_BUDGET_JPY;
  else process.env.MONTHLY_BUDGET_JPY = prev;
});

test("sessionMinutes: 選べる長さ以外・上限超えは上限に丸める", () => {
  const prev = process.env.SESSION_MAX_MINUTES;
  delete process.env.SESSION_MAX_MINUTES;
  assert.deepEqual(sessionLengths(), [5, 10, 15]);
  assert.equal(sessionMinutes(5), 5);
  assert.equal(sessionMinutes(10), 10);
  assert.equal(sessionMinutes(), 15);
  assert.equal(sessionMinutes(7), 15);
  assert.equal(sessionMinutes(60), 15);
  process.env.SESSION_MAX_MINUTES = "10";
  assert.deepEqual(sessionLengths(), [5, 10]);
  assert.equal(sessionMinutes(15), 10);
  if (prev === undefined) delete process.env.SESSION_MAX_MINUTES;
  else process.env.SESSION_MAX_MINUTES = prev;
});
