/** 表現の出題と状態遷移（queued → new → attempted/correct → mastered）の唯一の置き場所 */
import { and, asc, eq, inArray, isNotNull, lte, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, t } from "@/db";
import { LEARNING_STATUSES } from "@/db/schema";
import { EXPRESSION_CATEGORIES, EXPRESSION_KINDS, REGISTERS, type ExpressionKind } from "./categories";
import { DAY_MS } from "./format";
import type { Curriculum } from "./lesson";
import type { Scenario } from "./scenarios";

export type Expression = typeof t.expressions.$inferSelect;
export type ExpressionPick = { id: number; role: "new" | "review" };

const KIND_DESCRIPTION = "word=単語・句動詞・熟語・コロケーション（多くは1〜4語）/ phrase=文の型・言い回し";

/**
 * 覚える表現の核（FB の「覚える表現」と、分析の出力形式でも使う）。
 * SDK の構造化出力は enum を制約として強制しない（説明文に移す）ため、想定外の値は既定値に置き換えて分析全体を失敗させない。
 * 人が書く入力（ExpressionInput）では kind・category を上書きして厳密に検証する。
 */
export const KeyExpression = z.object({
  text: z.string().trim().min(1).describe("他の場面でも再利用できる部分（コロケーション・句動詞・言い回し）。文全体ではなく核になる部分"),
  meaning: z.string().trim().min(1).describe("日本語の意味"),
  kind: z.enum(EXPRESSION_KINDS).describe(KIND_DESCRIPTION).catch("phrase"),
  category: z.enum(EXPRESSION_CATEGORIES).catch("general"),
});
export type KeyExpression = z.infer<typeof KeyExpression>;

/** 表現集（seed）・週次レビューの JSON・画面からの追加で共通の入力形式 */
export const ExpressionInput = KeyExpression.extend({
  example: z.string().trim().default(""),
  scene: z.string().trim().default(""),
  category: z.enum(EXPRESSION_CATEGORIES).default("general"),
  register: z.enum(REGISTERS).default("neutral"),
  kind: z.enum(EXPRESSION_KINDS).default("phrase"),
});

/** 種類の指定がない手入力の表現: 4語以内なら単語・熟語、それより長ければフレーズ（分析の指示と同じ基準） */
export function inferKind(text: string): ExpressionKind {
  return text.trim().split(/\s+/).length <= 4 ? "word" : "phrase";
}

/** 1レッスンで出題する数 */
const NEW_PER_KIND = { phrase: 2, word: 2 } as const;

/**
 * 今日の表現を選ぶ: 新しいフレーズ2つ＋新しい単語・熟語2つ＋復習1つ（出題日が来たものがあれば）。
 * 新規は「自分で追加した表現（フィードバックからの追加・手入力・週次レビュー）→ シナリオのカテゴリ（先頭優先）
 * → 今週のカテゴリ → 登録順」。自分で選んだものは初期データより先に出題する。
 */
export async function pickTodaysExpressions(scenario: Scenario, curriculum: Curriculum) {
  const categories = [...new Set([...scenario.categories, ...curriculum.categories])];
  const queued = (kind: ExpressionKind) =>
    db()
      .select()
      .from(t.expressions)
      .where(and(eq(t.expressions.status, "queued"), eq(t.expressions.kind, kind)))
      .orderBy(
        sql`case when ${t.expressions.source} <> 'seed' then 0 else 1 end`,
        sql`coalesce(array_position(${`{${categories.join(",")}}`}::text[], ${t.expressions.category}), 999)`,
        asc(t.expressions.id),
      )
      .limit(NEW_PER_KIND[kind]);
  const [[review], phrases, words] = await Promise.all([
    db()
      .select()
      .from(t.expressions)
      .where(
        and(
          inArray(t.expressions.status, LEARNING_STATUSES),
          isNotNull(t.expressions.nextReviewAt),
          lte(t.expressions.nextReviewAt, sql`now()`),
        ),
      )
      .orderBy(asc(t.expressions.nextReviewAt))
      .limit(1),
    queued("phrase"),
    queued("word"),
  ]);
  return [
    ...[...phrases, ...words].map((e) => ({ ...e, role: "new" as const })),
    ...(review ? [{ ...review, role: "review" as const }] : []),
  ];
}

/** 画面で提示した表現を ID から引き直す（出題はページ表示時の1回だけ） */
export async function getPicked(picks: ExpressionPick[]) {
  if (!picks.length) return [];
  const rows = await db().select().from(t.expressions).where(inArray(t.expressions.id, picks.map((p) => p.id)));
  return picks.flatMap((p) => {
    const e = rows.find((r) => r.id === p.id);
    return e ? [{ ...e, role: p.role }] : [];
  });
}

/** 開始時: 出題した表現をセッションに紐付ける（状態はまだ変えない） */
export function attachToSession(sessionId: number, picks: ExpressionPick[]) {
  return db().insert(t.sessionExpressions).values(picks.map((p) => ({ sessionId, expressionId: p.id, role: p.role })));
}

/**
 * 会話が成立して終了したときだけ queued → new にする。
 * 開始直後に閉じた・落ちたセッションでは表現を消費せず、次回また出題される。
 */
export function markShownQuery(sessionId: number) {
  return db()
    .update(t.expressions)
    .set({ status: "new" })
    .where(
      and(
        eq(t.expressions.status, "queued"),
        inArray(
          t.expressions.id,
          db()
            .select({ id: t.sessionExpressions.expressionId })
            .from(t.sessionExpressions)
            .where(eq(t.sessionExpressions.sessionId, sessionId)),
        ),
      ),
    );
}

/** セッションで出題した表現とその結果 */
export function sessionTargets(sessionIds: number[]) {
  return db()
    .select({
      sessionId: t.sessionExpressions.sessionId,
      id: t.expressions.id,
      text: t.expressions.text,
      intervalDays: t.expressions.intervalDays,
      role: t.sessionExpressions.role,
      used: t.sessionExpressions.used,
      correct: t.sessionExpressions.correct,
      comment: t.sessionExpressions.comment,
    })
    .from(t.sessionExpressions)
    .innerJoin(t.expressions, eq(t.expressions.id, t.sessionExpressions.expressionId))
    .where(inArray(t.sessionExpressions.sessionId, sessionIds));
}

/** 練習済みの表現（今回の出題以外）。自発的に使えたら習得扱いにするため分析に渡す */
export function practicedExpressions(sessionId: number) {
  return db()
    .select({ id: t.expressions.id, text: t.expressions.text })
    .from(t.expressions)
    .where(
      and(
        inArray(t.expressions.status, ["attempted", "correct"]),
        notInArray(
          t.expressions.id,
          db()
            .select({ id: t.sessionExpressions.expressionId })
            .from(t.sessionExpressions)
            .where(eq(t.sessionExpressions.sessionId, sessionId)),
        ),
      ),
    )
    .limit(40);
}

/** 使用結果の反映（簡易的な間隔反復）。正しく使えたら間隔を伸ばし、誤用・未使用なら翌日に戻す */
export function recordUseQueries(
  sessionId: number,
  target: { id: number; intervalDays: number },
  r: { used: boolean; correct: boolean; comment: string },
) {
  const interval = r.used && r.correct ? Math.max(2, target.intervalDays * 2.5) : 1;
  const status = r.used ? (r.correct ? ("correct" as const) : ("attempted" as const)) : undefined;
  return [
    db()
      .update(t.sessionExpressions)
      .set({ used: r.used, correct: r.correct, comment: r.comment })
      .where(and(eq(t.sessionExpressions.sessionId, sessionId), eq(t.sessionExpressions.expressionId, target.id))),
    db()
      .update(t.expressions)
      .set({
        ...(status ? { status, intervalDays: interval } : {}),
        nextReviewAt: new Date(Date.now() + interval * DAY_MS),
      })
      .where(eq(t.expressions.id, target.id)),
  ] as const;
}

export function markMasteredQuery(ids: number[]) {
  return db()
    .update(t.expressions)
    .set({ status: "mastered", nextReviewAt: null })
    .where(inArray(t.expressions.id, ids));
}

export const EXPRESSION_ACTIONS = ["adopt", "master", "delete"] as const;
export type ExpressionAction = (typeof EXPRESSION_ACTIONS)[number];

/**
 * 表現リストに追加する（フィードバックの「＋追加」や手入力）。すでにあれば、提案中のものだけ出題待ちに上げる。
 */
export async function addExpression(input: unknown, source: "feedback" | "manual") {
  const parsed = ExpressionInput.safeParse(input);
  if (!parsed.success) return false;
  const e = parsed.data;
  await db()
    .insert(t.expressions)
    .values({ ...e, source, status: "queued" })
    .onConflictDoUpdate({
      target: t.expressions.text,
      set: { status: "queued" },
      setWhere: eq(t.expressions.status, "suggested"),
    });
  return true;
}

/** 画面からの手動操作: 提案を採用 / 習得済みにする / 削除 */
export async function applyExpressionAction(id: number, action: ExpressionAction) {
  if (action === "delete") return db().delete(t.expressions).where(eq(t.expressions.id, id));
  if (action === "master") return markMasteredQuery([id]);
  return db()
    .update(t.expressions)
    .set({ status: "queued" })
    .where(and(eq(t.expressions.id, id), eq(t.expressions.status, "suggested")));
}
