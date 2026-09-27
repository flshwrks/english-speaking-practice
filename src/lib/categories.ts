/** カテゴリ定義の唯一の置き場所。型・zod の enum・表示ラベルはすべてここから導く */

export const FEEDBACK_CATEGORIES = [
  "grammar",
  "collocation",
  "vocabulary",
  "naturalness",
  "register",
  "pronunciation",
  "prosody",
] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  grammar: "文法",
  collocation: "コロケーション",
  vocabulary: "語彙",
  naturalness: "自然さ",
  register: "丁寧さ・トーン",
  pronunciation: "発音",
  prosody: "抑揚・リズム",
};

/** 重大度（1〜3）のうち、明確な誤りとして扱う下限。1 は誤りではなく「より良い言い方」の提案 */
export const ERROR_MIN_SEVERITY = 2;
export const isUpgrade = (severity: number) => severity < ERROR_MIN_SEVERITY;

export const EXPRESSION_CATEGORIES = [
  "meetings",
  "agreeing_disagreeing",
  "hedging",
  "clarifying",
  "negotiating",
  "reporting",
  "small_talk",
  "presenting",
  "feedback",
  "general",
] as const;
export type ExpressionCategory = (typeof EXPRESSION_CATEGORIES)[number];

export const EXPRESSION_CATEGORY_LABEL: Record<ExpressionCategory, string> = {
  meetings: "会議",
  agreeing_disagreeing: "同意・反論",
  hedging: "ぼかし表現",
  clarifying: "確認・聞き返し",
  negotiating: "交渉",
  reporting: "進捗報告",
  small_talk: "スモールトーク",
  presenting: "プレゼン・質疑",
  feedback: "フィードバック",
  general: "その他",
};

/** phrase: 文・言い回し / word: 単語・句動詞・熟語・コロケーション */
export const EXPRESSION_KINDS = ["phrase", "word"] as const;
export type ExpressionKind = (typeof EXPRESSION_KINDS)[number];
export const EXPRESSION_KIND_LABEL: Record<ExpressionKind, string> = { phrase: "フレーズ", word: "単語・熟語" };
/** 会話 AI への指示文での見出し */
export const EXPRESSION_KIND_PROMPT: Record<ExpressionKind, string> = { phrase: "Phrases", word: "Words and idioms" };

export const REGISTERS = ["casual", "neutral", "formal"] as const;
export type Register = (typeof REGISTERS)[number];
export const REGISTER_LABEL: Record<Register, string> = { casual: "カジュアル", neutral: "", formal: "フォーマル" };
