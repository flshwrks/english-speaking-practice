/**
 * 会話難易度（profile.level 1〜10）の自動調整。DB を読まない純粋関数。
 *
 * 考え方:
 * - 1回の会話では動かさない（話題・体調で指標はぶれる。分析 AI の up/keep/down も1回ごとには揺れる）
 * - 会話ごとの「余裕度」（-1 苦戦 〜 +1 余裕）= 流暢さ 0.4 + 正確さ 0.3 + 分析 AI の判定 0.3
 *   （AI の判定は今回分しか残っていないので、過去の会話は実測の2つだけで出す）
 * - 余裕度の指数移動平均（α = 0.3）が しきい値を超え、かつ直近2回ともしきい値を超えたときだけ ±1（ヒステリシス）
 * - AI が逆向きを判定した回は動かさない
 */
import type { SessionMetrics } from "@/db/schema";

export type LevelSuggestion = "up" | "keep" | "down";

const clamp = (x: number) => Math.min(1, Math.max(-1, x));
const mean = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};

/**
 * 流暢さ: Azure の流暢さ（75 が中立）・話速（100wpm。ネイティブの会話は 130〜160）・
 * 話し始めるまでの時間（中央値 1.5秒）・ポーズなしで続けて言えた語数（5語）の平均。ない指標は除く
 */
function fluencyScore(m: SessionMetrics) {
  return mean([
    m.fluency === null ? null : clamp((m.fluency - 75) / 10),
    m.wpm > 0 ? clamp((m.wpm - 100) / 30) : null,
    m.medianLatencyMs === undefined ? null : clamp((1500 - m.medianLatencyMs) / 1000),
    m.meanLengthOfRun === undefined ? null : clamp((m.meanLengthOfRun - 5) / 3),
  ]);
}

/** 正確さ: 誤りのない節の割合（70% が中立）。古い会話は 100語あたりの誤り（3件が中立） */
function accuracyScore(m: SessionMetrics) {
  if (m.errorFreeClauseRatio !== undefined) return clamp((m.errorFreeClauseRatio - 0.7) / 0.15);
  return m.userWords ? clamp((3 - m.errorsPer100Words) / 2) : null;
}

/** 発話量が少ない会話は指標が当てにならないので割り引く（150語で満額、40語未満は無視） */
const reliability = (m: SessionMetrics) => (m.userWords < 40 ? 0 : Math.min(1, m.userWords / 150));

const SUGGESTION_SCORE: Record<LevelSuggestion, number> = { up: 1, keep: 0, down: -1 };
const WEIGHTS = { fluency: 0.4, accuracy: 0.3, llm: 0.3 } as const;

/** 1回の会話の余裕度（-1〜+1）。suggestion を渡さない回は実測だけで重みを配り直す */
export function sessionScore(m: SessionMetrics, suggestion?: LevelSuggestion) {
  const r = reliability(m);
  const parts: [number, number][] = [];
  const f = fluencyScore(m);
  const a = accuracyScore(m);
  if (f !== null && r) parts.push([WEIGHTS.fluency, f * r]);
  if (a !== null && r) parts.push([WEIGHTS.accuracy, a * r]);
  if (suggestion) parts.push([WEIGHTS.llm, SUGGESTION_SCORE[suggestion]]);
  const w = parts.reduce((s, [wi]) => s + wi, 0);
  return w ? parts.reduce((s, [wi, v]) => s + wi * v, 0) / w : 0;
}

const ALPHA = 0.3;
const THRESHOLD = 0.25;
/** 初回（レベル診断）は根拠がこれ以上なら ±1、STRONG 以上なら ±2 */
const CALIBRATE = 0.25;
const STRONG = 0.6;

/**
 * 次回の難易度を決める。recent は新しい順で、今回の会話を先頭に含める。
 * 呼び出し側は「今の難易度で行った会話」だけを渡すのが望ましい（変更のたびに根拠が積み直しになり、
 * 続けて2段上がる・下がることがなくなる）。
 */
export function decideLevel(input: { current: number; suggestion: LevelSuggestion; recent: SessionMetrics[] }): number {
  const { current, suggestion, recent } = input;
  const scores = recent.slice(0, 8).map((m, i) => sessionScore(m, i === 0 ? suggestion : undefined));
  if (!scores.length) scores.push(0.3 * SUGGESTION_SCORE[suggestion]);

  let delta = 0;
  if (scores.length === 1) {
    // 初回（レベル診断）: 積み上げる根拠がないので、今回の結果で初期値を合わせる
    const s = scores[0];
    delta = Math.sign(s) * (Math.abs(s) >= STRONG ? 2 : Math.abs(s) >= CALIBRATE ? 1 : 0);
  } else {
    // 古い順に指数移動平均
    const ema = scores.reduceRight((acc, s) => ALPHA * s + (1 - ALPHA) * acc);
    const [s0, s1] = scores;
    if (ema >= THRESHOLD && s0 >= THRESHOLD && s1 >= THRESHOLD && suggestion !== "down") delta = 1;
    else if (ema <= -THRESHOLD && s0 <= -THRESHOLD && s1 <= -THRESHOLD && suggestion !== "up") delta = -1;
  }
  return Math.min(10, Math.max(1, Math.round(current + delta)));
}
