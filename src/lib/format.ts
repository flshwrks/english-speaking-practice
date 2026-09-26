import type { WordAssessment } from "@/db/schema";

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

/** 分析にも画面にも出す「要注意の語」: 低スコア・弱い音素・韻律の誤りのいずれか */
export function isWeakWord(w: WordAssessment) {
  return w.accuracy < 70 || w.weakPhonemes.length > 0 || w.prosodyErrors.length > 0;
}

export function formatPhoneme(p: WordAssessment["weakPhonemes"][number]) {
  return `/${p.phoneme}/${p.heardAs ? `→/${p.heardAs}/` : ""}`;
}

/** 今日の表現の結果マーク */
export function targetMark(used: boolean | null, correct: boolean | null) {
  return used ? (correct ? "✅" : "🔺") : "⬜";
}
