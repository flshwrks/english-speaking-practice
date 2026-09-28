/**
 * ミスの型の優先度と状態（DB を読まない純粋関数）。
 *
 * - 優先度 = Σ（その回の重さ × e^(-経過日数/14)）。最近・重いミスほど高く、2週間で約1/3に減衰する
 *   その回の重さ = 重大度（3 なら 2、2 なら 1）× 件数の補正（1件 1.0 / 2件 1.5 / 3件以上 2.0）
 * - 状態は「何セッション続けて出ていないか」で決める（練習を休んだ日数では克服にならない）
 *   0〜2: active / 3〜5: improving / 6〜: resolved。一度 resolved 相当の間隔が空いたあとに再発したものは reopened
 */
import type { FeedbackCategory } from "./categories";
import { canonicalPatternKey, errorPattern } from "./error-patterns";

export type PatternOccurrence = {
  key: string;
  /** そのセッションが新しい順で何番目か（0 = 直近の完了セッション） */
  sessionIndex: number;
  daysAgo: number;
  severity: number;
};

export type WeaknessState = "active" | "improving" | "resolved" | "reopened";

export type Weakness = {
  key: string;
  label: string;
  category: FeedbackCategory;
  priority: number;
  state: WeaknessState;
  /** 期間内の出現件数 */
  count: number;
  /** 最後に出てから何セッションたったか */
  sessionsSinceLast: number;
  /** 初めて出てからのセッションのうち、出たセッションの割合（再発率） */
  recurrenceRate: number;
};

const HALF_LIFE_DAYS = 14;
export const IMPROVING_AFTER = 3;
export const RESOLVED_AFTER = 6;

const severityWeight = (severity: number) => (severity >= 3 ? 2 : 1);
const countWeight = (n: number) => 1 + 0.5 * (Math.min(n, 3) - 1);

/**
 * manualResolved: 週次レビューで克服済みにした key（その後に再発していないもの）。
 * "other" と、カタログにない key は追跡できないので対象外
 */
export function weaknessPriorities(occurrences: PatternOccurrence[], manualResolved: Set<string> = new Set()) {
  // key → セッション → そのセッションでの件数・最大重大度・経過日数
  const byKey = new Map<string, Map<number, { n: number; severity: number; daysAgo: number }>>();
  for (const o of occurrences) {
    const key = canonicalPatternKey(o.key);
    if (key === "other") continue;
    const sessions = byKey.get(key) ?? new Map();
    const s = sessions.get(o.sessionIndex) ?? { n: 0, severity: 0, daysAgo: o.daysAgo };
    sessions.set(o.sessionIndex, { n: s.n + 1, severity: Math.max(s.severity, o.severity), daysAgo: o.daysAgo });
    byKey.set(key, sessions);
  }

  const result: Weakness[] = [];
  for (const [key, sessions] of byKey) {
    const def = errorPattern(key)!;
    const indexes = [...sessions.keys()].sort((a, b) => a - b);
    let priority = 0;
    let count = 0;
    for (const s of sessions.values()) {
      priority += severityWeight(s.severity) * countWeight(s.n) * Math.exp(-s.daysAgo / HALF_LIFE_DAYS);
      count += s.n;
    }
    const sinceLast = indexes[0];
    // 出現の間に RESOLVED_AFTER 以上の空白があった＝一度克服したあとに再発した
    const hadGap = indexes.some((idx, i) => i > 0 && idx - indexes[i - 1] - 1 >= RESOLVED_AFTER);
    const state: WeaknessState =
      sinceLast >= RESOLVED_AFTER || manualResolved.has(key)
        ? "resolved"
        : sinceLast >= IMPROVING_AFTER
          ? "improving"
          : hadGap
            ? "reopened"
            : "active";
    result.push({
      key,
      label: def.label,
      category: def.category,
      priority: Math.round(priority * 100) / 100,
      state,
      count,
      sessionsSinceLast: sinceLast,
      recurrenceRate: Math.round((indexes.length / (indexes[indexes.length - 1] + 1)) * 100) / 100,
    });
  }
  // 克服済みは後ろ、それ以外は優先度の高い順
  return result.sort(
    (a, b) => Number(a.state === "resolved") - Number(b.state === "resolved") || b.priority - a.priority,
  );
}
