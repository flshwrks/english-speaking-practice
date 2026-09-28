import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { ExpressionCategory, ExpressionKind, FeedbackCategory, Register } from "../lib/categories";
import type { KeyExpression } from "../lib/expressions";

export type { FeedbackCategory };

/** 学習者プロフィール（1行のみ, id=1） */
export const profile = pgTable("profile", {
  id: integer("id").primaryKey().default(1),
  about: text("about").notNull().default(""),
  goals: text("goals").notNull().default(""),
  interests: text("interests").notNull().default(""),
  /** 会話難易度 1〜10 */
  level: integer("level").notNull().default(6),
  /** 全体カリキュラム（12週サイクル）の開始日。この日を含む週が Week 1 */
  programStart: date("program_start").notNull().defaultNow(),
  /** 週次レビューで「同じ週を繰り返す」を選んだ累計週数（その分だけ進行を遅らせる） */
  weekOffset: integer("week_offset").notNull().default(0),
  /** 学習者モデル（会話後の分析で毎回更新する学習者像。次の分析の背景知識に使う） */
  learnerModel: jsonb("learner_model").$type<LearnerModel>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 学習者像: どんな話し手か・強み・弱点・苦手な音。分析 AI が過去の会話を踏まえて書き直していく */
export type LearnerModel = {
  portrait: string;
  strengths: string[];
  weaknesses: string[];
  sounds: string[];
  /** 反映したセッション数 */
  sessions: number;
};

/** 全体カリキュラムの週ごとの上書き（週次レビューで指定した項目だけを、その週だけ差し替える。null は「差し替えない」） */
export const curriculum = pgTable("curriculum", {
  id: serial("id").primaryKey(),
  weekStart: date("week_start").notNull(),
  theme: text("theme"),
  focus: text("focus"),
  scenarioIds: jsonb("scenario_ids").$type<string[]>(),
  categories: jsonb("categories").$type<ExpressionCategory[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const weeklyReviews = pgTable("weekly_reviews", {
  id: serial("id").primaryKey(),
  weekStart: date("week_start").notNull(),
  summary: text("summary").notNull(),
  userComment: text("user_comment").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ExpressionStatus =
  | "suggested" // FB で提案されたが未採用
  | "queued" // 出題待ち
  | "new" // 出題済み・未使用
  | "attempted" // 使おうとしたが不正確
  | "correct" // 正しく使えた
  | "mastered"; // 促されずに使えた

/** 出題済みで、まだ習得していない表現 */
export const LEARNING_STATUSES = ["new", "attempted", "correct"] as const satisfies ExpressionStatus[];

export const expressions = pgTable(
  "expressions",
  {
    id: serial("id").primaryKey(),
    text: text("text").notNull(),
    meaning: text("meaning").notNull(),
    example: text("example").notNull().default(""),
    scene: text("scene").notNull().default(""),
    category: text("category").$type<ExpressionCategory>().notNull().default("general"),
    /** casual / neutral / formal */
    register: text("register").$type<Register>().notNull().default("neutral"),
    kind: text("kind").$type<ExpressionKind>().notNull().default("phrase"),
    /** seed / review / feedback */
    source: text("source").notNull().default("seed"),
    status: text("status").$type<ExpressionStatus>().notNull().default("queued"),
    /** 間隔反復（src/lib/srs.ts）: 安定度（日）・覚えやすさ・正しく使えた回数・誤用に戻った回数・続けて使わなかった回数 */
    intervalDays: real("interval_days").notNull().default(0),
    ease: real("ease").notNull().default(2.5),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    misses: integer("misses").notNull().default(0),
    lastPracticedAt: timestamp("last_practiced_at", { withTimezone: true }),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("expressions_text_idx").on(t.text)],
);

export type SessionStatus = "active" | "analyzing" | "done" | "error";

export type Turn = {
  role: "user" | "assistant";
  text: string;
  /** user ターンのみ: utterances.seq */
  seq?: number;
  /** user ターンのみ: AI が話し終えてから声を出し始めるまでの時間（AI の番の直後の発話だけ。2026-09-28 以降） */
  latencyMs?: number;
  /** user ターンのみ: AI の音声の再生中に話し始めた（AI の声の回り込み＝エコーの手がかり。2026-09-28 以降） */
  startedDuringAi?: boolean;
};

export type Usage = {
  realtimeUsd: number;
  azureSeconds: number;
  claudeInputTokens: number;
  claudeOutputTokens: number;
};

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  scenarioId: text("scenario_id").notNull(),
  status: text("status").$type<SessionStatus>().notNull().default("active"),
  level: integer("level").notNull(),
  turns: jsonb("turns").$type<Turn[]>().notNull().default([]),
  durationSec: integer("duration_sec").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
  usage: jsonb("usage").$type<Usage>(),
  summary: text("summary"),
  topPoints: jsonb("top_points").$type<{ title: string; detail: string }[]>(),
  /** WPM, 発音スコア平均など */
  metrics: jsonb("metrics").$type<SessionMetrics>(),
  /** 前回の最重要ポイント（宿題）を今回の会話で生かせたか。前回がなければ null */
  homework: jsonb("homework").$type<Homework>(),
  /** 会話 AI に渡した前回の最重要ポイント（開始時に記録。homework の判定の基準） */
  homeworkGiven: jsonb("homework_given").$type<{ title: string; detail: string }>(),
  /** この会話で使ったお題カード（再挑戦では同じカードを使う） */
  cardId: integer("card_id"),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  /** 選んだ会話の長さ（分）。サーバー側の時間制限に使う（null は古いセッション: 設定の上限を使う） */
  maxMinutes: integer("max_minutes"),
  /** 分析を始めた時刻。analyzing のまま一定時間たったら止まったとみなし、やり直せるようにする */
  analysisStartedAt: timestamp("analysis_started_at", { withTimezone: true }),
});

export type Homework = {
  /** 前回の topPoints[0].title */
  title: string;
  applied: boolean;
  /** 判定の根拠（日本語） */
  comment: string;
};

export type SessionMetrics = {
  userWords: number;
  speakingSec: number;
  wpm: number;
  lexicalDiversity: number;
  /** 分析 AI が発話ごとに数えた文法・語彙の誤りの 100語あたりの数。数えられなかった回は null */
  errorsPer100Words: number | null;
  accuracy: number | null;
  fluency: number | null;
  prosody: number | null;
  pron: number | null;
  /** 表示用の CEFR: 1回ごとの推定（cefrSession）の直近5回の中央値（計算は src/lib/metrics.ts） */
  estimatedCefr: string;
  // 以下は 2026-09-28 以降の会話のみ（計算方法は src/lib/metrics.ts）
  /** 分析 AI が付けた CEFR（補正前） */
  cefrLlm?: string;
  /** 今回1回分の CEFR: 分析 AI の判定を実測の目安から ±1 段階に収めたもの */
  cefrSession?: string;
  /** 誤りのない節の割合 0〜1（分析 AI が発話ごとに数えた節と誤りから） */
  errorFreeClauseRatio?: number;
  /** Azure が聞き取った語から、つなぎ語と繰り返しを除いた語数（wpm の分子） */
  spokenWords?: number;
  /** 発話1回あたりの語数 */
  meanUtteranceWords?: number;
  /** つなぎ語（uh, um）・直後の繰り返し（言い直し）の 100語あたりの回数 */
  fillersPer100Words?: number;
  repetitionsPer100Words?: number;
  /** ポーズ（250ms 以上）を除いた、口が動いている間の速さ。語の時刻がある発話のみ */
  articulationWpm?: number;
  /** 発話中のポーズ（250ms 以上）の 1分あたりの回数と、ポーズの間に続けて言えた平均語数 */
  pausesPerMin?: number;
  meanLengthOfRun?: number;
  /** AI が話し終えてから話し始めるまでの中央値（ms）と、3秒以上かかった割合 0〜1 */
  medianLatencyMs?: number;
  longLatencyRate?: number;
  /** Azure が Mispronunciation とした語の 100語あたりの数 */
  mispronouncedPer100Words?: number;
  /** Monotone（抑揚が平板）とされた語の割合 0〜1 */
  monotoneRate?: number;
};

export type WordAssessment = {
  word: string;
  accuracy: number;
  errorType: string;
  /** スコアの低い音素 */
  weakPhonemes: { phoneme: string; score: number; heardAs?: string }[];
  /** UnexpectedBreak / MissingBreak / Monotone など */
  prosodyErrors: string[];
  /** 発話の切り出し先頭からの語の開始時刻と長さ（ms）。2026-09-28 以降の評価のみ */
  offsetMs?: number;
  durationMs?: number;
};

export const utterances = pgTable(
  "utterances",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id").notNull(),
    seq: integer("seq").notNull(),
    /** Realtime API 側の文字起こし */
    transcript: text("transcript").notNull().default(""),
    /** Azure が実際に聞き取った語（言い間違いを残す） */
    heard: text("heard").notNull().default(""),
    durationMs: integer("duration_ms").notNull().default(0),
    accuracy: real("accuracy"),
    fluency: real("fluency"),
    prosody: real("prosody"),
    pron: real("pron"),
    words: jsonb("words").$type<WordAssessment[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("utterances_session_seq_idx").on(t.sessionId, t.seq)],
);

export const feedbackItems = pgTable("feedback_items", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  seq: integer("seq"),
  category: text("category").$type<FeedbackCategory>().notNull(),
  original: text("original").notNull(),
  improved: text("improved").notNull(),
  explanation: text("explanation").notNull(),
  severity: integer("severity").notNull(),
  patternKey: text("pattern_key").notNull(),
  /** この指摘から覚えておくと再利用できる部分（「＋追加」で表現リストに入れられる） */
  keyExpression: jsonb("key_expression").$type<KeyExpression>(),
});

export const errorPatterns = pgTable("error_patterns", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  category: text("category").$type<FeedbackCategory>().notNull(),
  count: integer("count").notNull().default(0),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  resolved: boolean("resolved").notNull().default(false),
});

/** セッションで出題した「今日の表現」と、その使用結果 */
export const sessionExpressions = pgTable(
  "session_expressions",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id").notNull(),
    expressionId: integer("expression_id").notNull(),
    /** new / review */
    role: text("role").notNull(),
    used: boolean("used"),
    correct: boolean("correct"),
    comment: text("comment"),
  },
  (t) => [uniqueIndex("session_expressions_idx").on(t.sessionId, t.expressionId)],
);

/** 言い直し練習の採点（台本あり評価）。score は言えなかった語を0点とした語ごとの平均 */
export type DrillScores = {
  score: number;
  accuracy: number | null;
  fluency: number | null;
  prosody: number | null;
  /** お手本の語のうち言えた割合（%） */
  completeness: number;
};

/** お手本の語ごとの結果。Insertion はお手本にない語（言い足し） */
export type DrillWord = {
  word: string;
  accuracy: number | null;
  errorType: "None" | "Mispronunciation" | "Omission" | "Insertion";
  weakPhonemes: WordAssessment["weakPhonemes"];
};

/** 添削の「言い直す」で、改善後の文を声に出して採点した記録 */
/**
 * お題カード: 1回の会話の状況・学習者の役・使える事実・ゴール。会話 AI と学習者が同じカードを見る。
 * 日本語の項目は学習者向け、partner は会話 AI 向け（英語）
 */
export type ScenarioCard = {
  /** 今回のお題（日本語の短い見出し） */
  title: string;
  /** 状況（日本語） */
  situation: string;
  /** 学習者の役（日本語）。自分として話す場面は null */
  role: string | null;
  /** 会話で使える事実・論点（日本語。数字や固有名詞を含む） */
  facts: string[];
  /** この会話で目指すこと（日本語） */
  goal: string;
  /** 会話 AI 向け: この場面での相手の立場・知っていること・狙い・切り出し方（英語） */
  partner: string;
  /** 重複よけ用の短い話題タグ（英語） */
  topic: string;
};

export const scenarioCards = pgTable("scenario_cards", {
  id: serial("id").primaryKey(),
  scenarioId: text("scenario_id").notNull(),
  card: jsonb("card").$type<ScenarioCard>().notNull(),
  costUsd: real("cost_usd").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const drillAttempts = pgTable("drill_attempts", {
  id: serial("id").primaryKey(),
  feedbackItemId: integer("feedback_item_id").notNull(),
  referenceText: text("reference_text").notNull(),
  scores: jsonb("scores").$type<DrillScores>().notNull(),
  words: jsonb("words").$type<DrillWord[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** ログイン失敗の記録（総当たり対策: 直近の失敗が多いとしばらくログインを受け付けない） */
export const loginFailures = pgTable("login_failures", {
  id: serial("id").primaryKey(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});
