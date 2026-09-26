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
import type { ExpressionCategory, FeedbackCategory, Register } from "../lib/categories";

export type { FeedbackCategory };

/** 学習者プロフィール（1行のみ, id=1） */
export const profile = pgTable("profile", {
  id: integer("id").primaryKey().default(1),
  about: text("about").notNull().default(""),
  goals: text("goals").notNull().default(""),
  interests: text("interests").notNull().default(""),
  /** 会話難易度 1〜10 */
  level: integer("level").notNull().default(6),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 週次レビューで書き込むカリキュラム */
export const curriculum = pgTable("curriculum", {
  id: serial("id").primaryKey(),
  weekStart: date("week_start").notNull(),
  theme: text("theme").notNull(),
  focus: text("focus").notNull().default(""),
  /** 推奨シナリオ ID */
  scenarioIds: jsonb("scenario_ids").$type<string[]>().notNull().default([]),
  /** 表現カテゴリ（新規表現の補充に使う） */
  categories: jsonb("categories").$type<string[]>().notNull().default([]),
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
    /** seed / review / feedback */
    source: text("source").notNull().default("seed"),
    status: text("status").$type<ExpressionStatus>().notNull().default("queued"),
    curriculumId: integer("curriculum_id"),
    intervalDays: real("interval_days").notNull().default(0),
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
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SessionMetrics = {
  userWords: number;
  speakingSec: number;
  wpm: number;
  lexicalDiversity: number;
  errorsPer100Words: number;
  accuracy: number | null;
  fluency: number | null;
  prosody: number | null;
  pron: number | null;
  estimatedCefr: string;
};

export type WordAssessment = {
  word: string;
  accuracy: number;
  errorType: string;
  /** スコアの低い音素 */
  weakPhonemes: { phoneme: string; score: number; heardAs?: string }[];
  /** UnexpectedBreak / MissingBreak / Monotone など */
  prosodyErrors: string[];
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
