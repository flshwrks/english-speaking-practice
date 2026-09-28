import type { ExpressionCategory } from "./categories";
import { DAY_MS, isoDateJst } from "./format";

export type Scenario = {
  id: string;
  title: string;
  /** 学習者向けの説明（日本語） */
  brief: string;
  /** AI に渡す役割設定（英語） */
  role: string;
  /** 関連する表現カテゴリ（先頭ほど優先して出題） */
  categories: ExpressionCategory[];
  /** 初回（完了セッション0件）だけ表示・推奨する */
  onboarding?: boolean;
};

export const SCENARIOS: Scenario[] = [
  {
    id: "diagnostic",
    title: "レベル診断",
    brief: "経歴や興味について自由に話し、最初の難易度を決めます。",
    role: "You are a friendly interviewer getting to know a new colleague. Ask open questions about their background, studies, interests, and career goals, then follow up with 'why' and 'how' questions that require longer answers. Gradually increase the complexity of your questions to probe their ceiling.",
    categories: ["small_talk"],
    onboarding: true,
  },
  {
    id: "self-intro",
    title: "海外チームへの自己紹介",
    brief: "グローバル案件の初日。PMのAlexに自己紹介し、役割や期待を確認します。",
    role: "You are Alex, a project manager at a global consulting firm in London. The learner has just joined your cross-border project team from Tokyo. Welcome them, ask them to introduce themselves, then discuss what they'll work on and what they expect from the project.",
    categories: ["small_talk", "clarifying"],
  },
  {
    id: "status-report",
    title: "定例会議での進捗報告",
    brief: "週次ミーティングで担当タスクの進捗を報告します。一部に遅れがあります。",
    role: "You are Priya, the team lead running a weekly status meeting on a video call. Ask the learner for an update on their workstream (a market analysis that is about a week behind schedule). Probe the reasons for the delay, the impact, and the recovery plan.",
    categories: ["reporting", "meetings"],
  },
  {
    id: "pushback",
    title: "会議で反対意見を述べる",
    brief: "上司が提案した方針に懸念があります。角を立てずに反論し、代案を出します。",
    role: "You are Mark, a senior manager. You propose cutting the customer interview phase to save two weeks. You are fairly attached to your idea. Invite the learner's opinion and push back on weak arguments, but be persuadable by well-reasoned ones.",
    categories: ["agreeing_disagreeing", "hedging", "meetings"],
  },
  {
    id: "clarify",
    title: "曖昧な要件を確認する",
    brief: "クライアントの依頼が曖昧です。質問して要件をはっきりさせます。",
    role: "You are Jennifer, a client-side director. Give the learner a vague request ('We need something on our Asia strategy by end of month'). Only reveal specifics (scope, audience, format, deadline, budget) when asked good clarifying questions.",
    categories: ["clarifying"],
  },
  {
    id: "negotiate",
    title: "納期とスコープの交渉",
    brief: "クライアントが納期の前倒しを求めています。条件を調整して合意を目指します。",
    role: "You are Tom, a procurement manager at a client company. You want the deliverable two weeks earlier with no change in scope or fee. Negotiate firmly; concede only in exchange for something.",
    categories: ["negotiating", "hedging"],
  },
  {
    id: "presentation-qa",
    title: "プレゼン後の質疑応答",
    brief: "新規事業の提案を発表し終えたところ。鋭い質問に答えます。",
    role: "You are a skeptical executive audience member. The learner has just presented a proposal to launch a subscription service in Southeast Asia. Ask tough questions about assumptions, risks, numbers, and competition, one at a time.",
    categories: ["presenting", "hedging"],
  },
  {
    id: "small-talk",
    title: "会議前のスモールトーク",
    brief: "会議が始まるまでの数分間、海外の同僚と雑談します。",
    role: "You are Sam, a colleague from the Singapore office, chatting casually a few minutes before a meeting starts. Talk about weekends, travel, food, the weather, and work life. Keep it light and natural, with occasional humor.",
    categories: ["small_talk"],
  },
  {
    id: "feedback-1on1",
    title: "1on1でのフィードバック",
    brief: "マネージャーとの1on1。フィードバックを受け、自分からも改善提案をします。",
    role: "You are Chris, the learner's manager, in a monthly 1-on-1. Give balanced feedback (strong analysis, but updates to stakeholders are too infrequent), then ask for their feedback on how the team works.",
    categories: ["feedback"],
  },
  {
    id: "free-talk",
    title: "フリートーク",
    brief: "興味のある話題について自由に話します。",
    role: "You are a curious, well-read conversation partner. Let the learner pick a topic (or suggest one related to their interests), then have a genuine discussion, sharing your own views and asking for theirs.",
    categories: ["hedging", "agreeing_disagreeing"],
  },
];

export function getScenario(id: string) {
  return SCENARIOS.find((s) => s.id === id);
}

/** 今日のおすすめを決める材料（ホーム用。省略時は日付だけで今週のシナリオを日替わりにする） */
export type ScenarioContext = {
  /** 直近の完了セッションのシナリオ ID（新しい順） */
  recentScenarioIds?: string[];
  /** 苦手な表現カテゴリ（expressions.ts の weakExpressionCategories） */
  weakCategories?: readonly string[];
  /** 日本時間の今日（YYYY-MM-DD） */
  today?: string;
};

/**
 * 今週のシナリオの並べ替え（先頭が今日のおすすめ）。点数の高い順:
 * - 直前の会話と同じシナリオは -2、直近5回に出た回数ごとに -0.5（同じ場面ばかりにしない）
 * - 苦手な表現カテゴリを含むごとに +0.5（使う場面を作る）
 * - 同点は日付で回す（毎日違うシナリオが先頭に来る）
 */
export function rankScenarios(ids: string[], ctx: ScenarioContext = {}) {
  const recent = (ctx.recentScenarioIds ?? []).slice(0, 5);
  const weak = new Set(ctx.weakCategories ?? []);
  const day = Math.floor(Date.parse(ctx.today ?? isoDateJst(new Date())) / DAY_MS);
  const score = (id: string) => {
    const categories = getScenario(id)?.categories ?? [];
    return (
      (recent[0] === id ? -2 : 0) -
      0.5 * recent.filter((r) => r === id).length +
      0.5 * categories.filter((c) => weak.has(c)).length
    );
  };
  const n = ids.length;
  return ids
    .map((id, i) => ({ id, score: score(id), turn: (((i - day) % n) + n) % n }))
    .sort((x, y) => y.score - x.score || x.turn - y.turn)
    .map((x) => x.id);
}

/** 表示するシナリオとおすすめ。初回はレベル診断、以降は今週のカリキュラムのシナリオを rankScenarios の順で先頭に */
export function scenarioMenu(completedSessions: number, curriculumScenarioIds: string[], ctx?: ScenarioContext) {
  const first = completedSessions === 0;
  const visible = SCENARIOS.filter((s) => first || !s.onboarding);
  const recommended = first
    ? SCENARIOS.filter((s) => s.onboarding).map((s) => s.id)
    : rankScenarios(
        curriculumScenarioIds.filter((id) => visible.some((s) => s.id === id)),
        ctx,
      );
  return {
    scenarios: [
      ...recommended.map((id) => visible.find((s) => s.id === id)!),
      ...visible.filter((s) => !recommended.includes(s.id)),
    ],
    recommended: new Set(recommended),
  };
}

/**
 * 難易度 1〜10 ごとの AI の話し方。文の長さ・語彙・質問の圧の3軸を少しずつずらし、どの1段にも違いがあるようにする
 */
const SENTENCES = [
  "Use very short sentences (under 10 words).",
  "Use short sentences (under 10 words).",
  "Use short sentences (under 14 words).",
  "Use short sentences (under 14 words).",
  "Keep most sentences under 18 words.",
  "Keep most sentences under 18 words.",
  "Use natural sentence length.",
  "Use natural sentence length, including some complex sentences.",
  "Use long, complex sentences when natural.",
  "Use long, complex sentences and change topics quickly, as in a busy real meeting.",
];
const VOCABULARY = [
  "Use only very common words; avoid idioms and phrasal verbs.",
  "Use only very common words; avoid idioms and phrasal verbs.",
  "Use everyday business words; avoid idioms and slang.",
  "Use everyday business words; avoid idioms and slang.",
  "Use natural business English with an occasional common idiom or phrasal verb.",
  "Use natural business English with some common idioms and phrasal verbs.",
  "Use idiomatic business English, including phrasal verbs.",
  "Use idiomatic business English with phrasal verbs and some jargon.",
  "Use dense, nuanced vocabulary, idioms, and industry jargon.",
  "Use dense, nuanced vocabulary, idioms, and industry jargon, like a demanding native executive.",
];
const QUESTIONS = [
  "Ask one simple yes/no or either-or question at a time. Be patient and supportive; if the learner seems lost, rephrase more simply.",
  "Ask one simple question at a time. Be patient and supportive; if the learner seems lost, rephrase more simply.",
  "Ask one simple open question at a time. Be patient; if the learner seems lost, rephrase more simply.",
  "Ask one question at a time and encourage longer answers with gentle follow-ups.",
  "Ask one question at a time and encourage longer answers with follow-ups asking why or how.",
  "Ask follow-up questions that require explanations, and politely ask for specifics when an answer is vague.",
  "Ask follow-up questions that require explanations, and challenge vague answers politely.",
  "Push back on weak points and ask for numbers, examples, and specifics.",
  "Push back firmly, introduce some ambiguity, and occasionally interrupt to redirect.",
  "Push back strongly, leave things ambiguous on purpose, and interrupt when the learner rambles. Expect precise, well-structured answers.",
];

const levelIndex = (level: number) => Math.min(10, Math.max(1, Math.round(level))) - 1;

export const levelGuidance = (level: number) => {
  const i = levelIndex(level);
  return `${SENTENCES[i]} ${VOCABULARY[i]} ${QUESTIONS[i]}`;
};

/** 話す速度（Realtime API の speed, 1.0 が標準）。1段ごとに 0.035 ずつ（1: 0.80 〜 10: 1.12） */
export const speechSpeed = (level: number) => Math.round((0.8 + levelIndex(level) * 0.035) * 1000) / 1000;
