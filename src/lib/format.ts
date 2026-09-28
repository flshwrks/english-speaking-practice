import type { WordAssessment } from "@/db/schema";
import { isFunctionWord } from "./metrics";

export const DAY_MS = 24 * 60 * 60 * 1000;

/** 表現の見出しから空所（___）や補足の括弧を取り除く。blank は空所の置き換え（読み上げなら "something"） */
export function plainExpressionText(text: string, blank = "") {
  return text
    .replace(/_{2,}/g, blank)
    .replace(/\.{3}|\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 日本時間の日付。short は「9/26」、それ以外は「2026/9/26」 */
export function formatDateJst(d: Date, style: "short" | "full" = "short") {
  return d.toLocaleDateString(
    "ja-JP",
    style === "short" ? { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" } : { timeZone: "Asia/Tokyo" },
  );
}

/** 日本時間の YYYY-MM-DD */
export function isoDateJst(d: Date) {
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

/**
 * 分析にも画面にも出す「要注意の語」: 語の点数が低いか、音素がはっきり外れた（50点未満）もの。
 * 語全体が90点以上なら、音素1つの低い点は Azure の揺れとみなす（実データで situation 91点の /s/ が0点など）。
 * Monotone は発話全体にかかる評価で、ほぼ全語に付くので語の印には使わない。
 * 機能語（and, the, that など）は弱く発音するのが自然なので、点数がかなり低いときだけ
 */
export function isWeakWord(w: WordAssessment) {
  if (isFunctionWord(w.word)) return w.accuracy < 60;
  return (
    w.accuracy < 75 ||
    w.errorType === "Mispronunciation" ||
    (w.accuracy < 90 && w.weakPhonemes.some((p) => p.score < 50)) ||
    w.prosodyErrors.some((e) => e !== "Monotone")
  );
}

export function formatPhoneme(p: WordAssessment["weakPhonemes"][number]) {
  return `/${p.phoneme}/${p.heardAs ? `→/${p.heardAs}/` : ""}`;
}

/** 今日の表現の結果マーク */
export function targetMark(used: boolean | null, correct: boolean | null) {
  return used ? (correct ? "✅" : "🔺") : "⬜";
}
