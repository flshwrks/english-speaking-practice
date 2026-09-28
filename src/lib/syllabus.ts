/**
 * 全体カリキュラム（12週で1周）。週が変わると自動で次へ進む。
 * 13週目からは2周目に入り、同じ流れを難易度（profile.level）を上げた状態でもう一度回す。
 * 週次レビューでは、この内容を curriculum テーブルで週単位に上書きしたり、同じ週を繰り返したりできる。
 */
import type { ExpressionCategory } from "./categories";
import { DAY_MS } from "./format";

export type SyllabusWeek = {
  phase: string;
  theme: string;
  /** 会話 AI のプロンプトに入る今週の重点（英語） */
  focus: string;
  scenarioIds: string[];
  categories: ExpressionCategory[];
};

export const SYLLABUS: SyllabusWeek[] = [
  // --- Phase 1: 基礎（1〜4週）: 自分のことを話す・聞き返す・報告する ---
  {
    phase: "基礎",
    theme: "自己紹介とスモールトーク",
    focus:
      "Introduce yourself in 30-60 seconds with a clear structure (role, background, what you want to work on), and keep small talk going by asking follow-up questions.",
    scenarioIds: ["self-intro", "small-talk", "internship-interview"],
    categories: ["small_talk", "general"],
  },
  {
    phase: "基礎",
    theme: "聞き返しと確認",
    focus:
      "When something is unclear, ask for clarification instead of guessing, and paraphrase to confirm understanding.",
    scenarioIds: ["clarify", "ob-visit", "self-intro"],
    categories: ["clarifying", "general"],
  },
  {
    phase: "基礎",
    theme: "進捗報告",
    focus: "Report progress conclusion-first: status, key numbers, blockers, and next steps, in that order.",
    scenarioIds: ["status-report", "research-talk"],
    categories: ["reporting", "general"],
  },
  {
    phase: "基礎",
    theme: "1on1とフィードバック",
    focus: "Receive feedback without over-apologizing, ask for specifics, and make concrete suggestions of your own.",
    scenarioIds: ["feedback-1on1", "status-report", "ob-visit"],
    categories: ["feedback", "reporting"],
  },
  // --- Phase 2: 会議（5〜8週）: 意見を言う・賛否を示す ---
  {
    phase: "会議",
    theme: "会議で発言する",
    focus:
      "Jump into the discussion at the right moment, build on others' points, and move the meeting toward next steps.",
    scenarioIds: ["status-report", "pushback", "group-discussion"],
    categories: ["meetings", "general"],
  },
  {
    phase: "会議",
    theme: "賛成・反対をやわらかく伝える",
    focus: "Disagree politely: acknowledge the other view first, then give your reason and an alternative.",
    scenarioIds: ["pushback", "group-discussion"],
    categories: ["agreeing_disagreeing", "hedging"],
  },
  {
    phase: "会議",
    theme: "意見を論理的に述べる",
    focus:
      "State your opinion with a clear point, two reasons, and an example. Use hedging to sound confident but not arrogant.",
    scenarioIds: ["case-interview", "free-talk", "pushback"],
    categories: ["hedging", "agreeing_disagreeing"],
  },
  {
    phase: "会議",
    theme: "振り返り（1〜7週の総復習）",
    focus: "Consolidate: use as many of the expressions practiced so far as possible, naturally.",
    scenarioIds: ["small-talk", "status-report", "pushback", "internship-interview"],
    categories: ["small_talk", "reporting", "meetings", "agreeing_disagreeing"],
  },
  // --- Phase 3: 応用（9〜12週）: プレゼン・交渉・難しい会話 ---
  {
    phase: "応用",
    theme: "プレゼン後の質疑応答",
    focus:
      "Answer tough questions with the short answer first, then the reasoning. Buy time naturally when you need it.",
    scenarioIds: ["presentation-qa", "research-talk"],
    categories: ["presenting", "hedging"],
  },
  {
    phase: "応用",
    theme: "交渉の基本",
    focus: "Explore the other side's priorities with questions, and trade concessions instead of simply giving in.",
    scenarioIds: ["negotiate", "case-interview"],
    categories: ["negotiating", "general"],
  },
  {
    phase: "応用",
    theme: "難しい会話を乗り切る",
    focus: "Hold your position under pressure while staying polite; propose a middle ground with clear conditions.",
    scenarioIds: ["negotiate", "pushback", "presentation-qa", "group-discussion"],
    categories: ["negotiating", "agreeing_disagreeing"],
  },
  {
    phase: "応用",
    theme: "総合・振り返り",
    focus: "Consolidate everything: structure, clarification, polite disagreement, and negotiation, at natural speed.",
    scenarioIds: ["free-talk", "negotiate", "presentation-qa", "case-interview"],
    categories: ["presenting", "negotiating", "feedback", "clarifying"],
  },
];

/** 日本時間でその日を含む週の月曜（YYYY-MM-DD） */
export function mondayOf(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7; // 月曜=0
  return addDays(dateStr, -offset);
}

export function addDays(dateStr: string, days: number) {
  return new Date(Date.parse(`${dateStr}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * その日（YYYY-MM-DD, JST）が全体カリキュラムの何周目・何週目か。
 * weekOffset は「同じ週を繰り返す」を選んだ累計週数で、その分だけ進行を遅らせる。
 */
export type SyllabusPosition = SyllabusWeek & { cycle: number; week: number; weekStart: string };

export function syllabusPosition(
  schedule: { programStart: string; weekOffset: number },
  date: string,
): SyllabusPosition {
  const weekStart = mondayOf(date);
  const elapsed = Math.round((Date.parse(weekStart) - Date.parse(mondayOf(schedule.programStart))) / (7 * DAY_MS));
  const weekIndex = Math.max(0, elapsed - schedule.weekOffset);
  return {
    cycle: Math.floor(weekIndex / SYLLABUS.length) + 1,
    week: (weekIndex % SYLLABUS.length) + 1,
    weekStart,
    ...SYLLABUS[weekIndex % SYLLABUS.length],
  };
}
