/** 表現の出題と状態遷移（queued → new → attempted/correct → mastered）の唯一の置き場所 */
import { and, asc, eq, inArray, isNotNull, lte, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, t } from "@/db";
import { LEARNING_STATUSES } from "@/db/schema";
import { EXPRESSION_CATEGORIES, REGISTERS } from "./categories";
import type { Curriculum } from "./lesson";
import type { Scenario } from "./scenarios";

export type Expression = typeof t.expressions.$inferSelect;
export type ExpressionPick = { id: number; role: "new" | "review" };

const DAY_MS = 24 * 60 * 60 * 1000;

/** 表現集（seed）と週次レビューの JSON で共通の入力形式 */
export const ExpressionInput = z.object({
  text: z.string().min(1),
  meaning: z.string().min(1),
  example: z.string().default(""),
  scene: z.string().default(""),
  category: z.enum(EXPRESSION_CATEGORIES).default("general"),
  register: z.enum(REGISTERS).default("neutral"),
});

/**
 * 今日の表現を3つ選ぶ: 新規2つ＋復習1つ（復習がなければ新規3つ）。
 * 新規は「今週のカリキュラムで追加 → シナリオのカテゴリ（先頭優先）→ 今週のカテゴリ → 登録順」。
 */
export async function pickTodaysExpressions(scenario: Scenario, curriculum: Curriculum | null) {
  const categories = [...new Set([...scenario.categories, ...(curriculum?.categories ?? [])])];
  const [[review], queued] = await Promise.all([
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
    db()
      .select()
      .from(t.expressions)
      .where(eq(t.expressions.status, "queued"))
      .orderBy(
        sql`case when ${t.expressions.curriculumId} = ${curriculum?.id ?? -1} then 0 else 1 end`,
        sql`coalesce(array_position(${`{${categories.join(",")}}`}::text[], ${t.expressions.category}), 999)`,
        asc(t.expressions.id),
      )
      .limit(3),
  ]);
  return [
    ...queued.slice(0, review ? 2 : 3).map((e) => ({ ...e, role: "new" as const })),
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

/** 出題の記録: セッションとの紐付けと queued → new */
export function markShownQueries(sessionId: number, picks: ExpressionPick[]) {
  return [
    db().insert(t.sessionExpressions).values(picks.map((p) => ({ sessionId, expressionId: p.id, role: p.role }))),
    db()
      .update(t.expressions)
      .set({ status: "new" })
      .where(and(inArray(t.expressions.id, picks.map((p) => p.id)), eq(t.expressions.status, "queued"))),
  ] as const;
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

/** 画面からの手動操作: 提案を採用 / 習得済みにする / 削除 */
export async function applyExpressionAction(id: number, action: ExpressionAction) {
  if (action === "delete") return db().delete(t.expressions).where(eq(t.expressions.id, id));
  if (action === "master") return markMasteredQuery([id]);
  return db()
    .update(t.expressions)
    .set({ status: "queued" })
    .where(and(eq(t.expressions.id, id), eq(t.expressions.status, "suggested")));
}
