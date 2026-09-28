/** 表現の出題と状態遷移（queued → new → attempted/correct → mastered）の唯一の置き場所。間隔反復の計算は srs.ts */
import { and, asc, desc, eq, gte, inArray, lt, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, t } from "@/db";
import { LEARNING_STATUSES } from "@/db/schema";
import { EXPRESSION_CATEGORIES, EXPRESSION_KINDS, REGISTERS, type ExpressionKind } from "./categories";
import { isoDateJst } from "./format";
import type { Curriculum } from "./lesson";
import type { Scenario } from "./scenarios";
import { addDays } from "./syllabus";
import {
  isLeech,
  jstMidnight,
  LEECH_MISSES,
  lessonSlots,
  reviewPriority,
  schedule,
  type Grade,
  type SrsState,
} from "./srs";

export type Expression = typeof t.expressions.$inferSelect;
export type ExpressionPick = { id: number; role: "new" | "review" };

const KIND_DESCRIPTION = "word=単語・句動詞・熟語・コロケーション（多くは1〜4語）/ phrase=文の型・言い回し";

/**
 * 覚える表現の核（FB の「覚える表現」と、分析の出力形式でも使う）。
 * SDK の構造化出力は enum を制約として強制しない（説明文に移す）ため、想定外の値は既定値に置き換えて分析全体を失敗させない。
 * 人が書く入力（ExpressionInput）では kind・category を上書きして厳密に検証する。
 */
export const KeyExpression = z.object({
  text: z
    .string()
    .trim()
    .min(1)
    .describe("他の場面でも再利用できる部分（コロケーション・句動詞・言い回し）。文全体ではなく核になる部分"),
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

/** 間隔反復の計算に使う列（srs.ts の SrsState） */
const srsColumns = {
  id: t.expressions.id,
  status: t.expressions.status,
  intervalDays: t.expressions.intervalDays,
  ease: t.expressions.ease,
  reps: t.expressions.reps,
  lapses: t.expressions.lapses,
  misses: t.expressions.misses,
  lastPracticedAt: t.expressions.lastPracticedAt,
  nextReviewAt: t.expressions.nextReviewAt,
};

const today = () => isoDateJst(new Date());
/** 今日が期限（日本時間の明日 0:00 より前）の表現 */
const dueBy = (day: string) => lt(t.expressions.nextReviewAt, jstMidnight(addDays(day, 1)));

/** 新規の枠を種類に配る。奇数のときは、練習中の表現が少ない（負荷の軽い）種類に1つ多く */
function splitFresh(fresh: number, learning: Record<ExpressionKind, number>): Record<ExpressionKind, number> {
  const extra = fresh % 2 ? (learning.word < learning.phrase ? "word" : "phrase") : null;
  const half = Math.floor(fresh / 2);
  return { phrase: half + (extra === "phrase" ? 1 : 0), word: half + (extra === "word" ? 1 : 0) };
}

/**
 * 同じ優先順の候補から n 個選ぶ。自分で追加した表現（seed 以外）は順番どおり先に取り、
 * 残りはカテゴリを1つずつ順に回して、同じカテゴリばかりにならないようにする（シナリオのカテゴリが先）
 */
function interleave(candidates: Expression[], categories: string[], n: number) {
  const picked = candidates.filter((e) => e.source !== "seed").slice(0, n);
  const pools = categories.map((c) => candidates.filter((e) => e.source === "seed" && e.category === c));
  while (picked.length < n && pools.some((p) => p.length)) {
    for (const pool of pools) {
      const e = pool.shift();
      if (e && picked.length < n) picked.push(e);
    }
  }
  // カテゴリの指定から外れた表現しか残っていなければ、登録順で埋める
  for (const e of candidates) if (picked.length < n && !picked.includes(e)) picked.push(e);
  return picked;
}

/**
 * 今日の表現を選ぶ。合計5つまで（復習が多い日は新規を減らす。枠の数は srs.ts の lessonSlots）。
 * - 復習: 期限の来た表現を、忘れかけている順（想起確率の低い順）に。今日のシナリオ・今週のカテゴリに合うものを優先
 * - 新規: 自分で追加した表現 → シナリオのカテゴリ（先頭優先、カテゴリを交互に）→ 今週のカテゴリ → 登録順
 * 同じ日・同じシナリオ・同じ DB の状態なら必ず同じ組み合わせになる（ホームのプレビューと準備画面が一致する）
 */
export async function pickTodaysExpressions(scenario: Scenario, curriculum: Curriculum) {
  const day = today();
  const categories = [...new Set([...scenario.categories, ...curriculum.categories])];
  const categoryRank = sql`coalesce(array_position(${`{${categories.join(",")}}`}::text[], ${t.expressions.category}), 999)`;
  const queued = (kind: ExpressionKind) =>
    db()
      .select()
      .from(t.expressions)
      .where(and(eq(t.expressions.status, "queued"), eq(t.expressions.kind, kind)))
      .orderBy(sql`case when ${t.expressions.source} <> 'seed' then 0 else 1 end`, categoryRank, asc(t.expressions.id))
      .limit(40);
  const [due, learning, phrases, words] = await Promise.all([
    db()
      .select()
      .from(t.expressions)
      .where(and(inArray(t.expressions.status, LEARNING_STATUSES), dueBy(day))),
    db()
      .select({ kind: t.expressions.kind, n: sql<number>`count(*)::int` })
      .from(t.expressions)
      .where(inArray(t.expressions.status, LEARNING_STATUSES))
      .groupBy(t.expressions.kind),
    queued("phrase"),
    queued("word"),
  ]);

  // 休み中の苦手（leech）は期限が先なので due に入らず、休み明けのものは普通の復習として数える
  const slots = lessonSlots(due.length);
  const relevant = new Set<string>(categories);
  const reviews = due
    .map((e) => ({ e, p: reviewPriority(e, day, relevant.has(e.category)) }))
    .sort((a, b) => b.p - a.p || a.e.id - b.e.id)
    .slice(0, slots.reviews)
    .map(({ e }) => e);
  const learningByKind = { phrase: 0, word: 0, ...Object.fromEntries(learning.map((r) => [r.kind, r.n])) };
  const fresh = splitFresh(slots.fresh, learningByKind);
  return [
    ...[
      ...interleave(phrases, scenario.categories, fresh.phrase),
      ...interleave(words, scenario.categories, fresh.word),
    ].map((e) => ({ ...e, role: "new" as const })),
    ...reviews.map((e) => ({ ...e, role: "review" as const })),
  ];
}

/** 画面で提示した表現を ID から引き直す（出題はページ表示時の1回だけ） */
export async function getPicked(picks: ExpressionPick[]) {
  if (!picks.length) return [];
  const rows = await db()
    .select()
    .from(t.expressions)
    .where(
      inArray(
        t.expressions.id,
        picks.map((p) => p.id),
      ),
    );
  return picks.flatMap((p) => {
    const e = rows.find((r) => r.id === p.id);
    return e ? [{ ...e, role: p.role }] : [];
  });
}

/** 開始時: 出題した表現をセッションに紐付ける（状態はまだ変えない） */
export function attachToSession(sessionId: number, picks: ExpressionPick[]) {
  return db()
    .insert(t.sessionExpressions)
    .values(picks.map((p) => ({ sessionId, expressionId: p.id, role: p.role })));
}

/**
 * 会話が成立して終了したときだけ queued → new にする。
 * 開始直後に閉じた・落ちたセッションでは表現を消費せず、次回また出題される。
 * 分析が失敗しても復習から漏れないよう、翌日を期限にしておく（分析が成功すれば結果で上書きされる）
 */
export function markShownQuery(sessionId: number) {
  return db()
    .update(t.expressions)
    .set({ status: "new", nextReviewAt: jstMidnight(addDays(today(), 1)) })
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

/** セッションで出題した表現とその結果（間隔反復の状態つき） */
export function sessionTargets(sessionIds: number[]) {
  return db()
    .select({
      ...srsColumns,
      sessionId: t.sessionExpressions.sessionId,
      text: t.expressions.text,
      role: t.sessionExpressions.role,
      used: t.sessionExpressions.used,
      correct: t.sessionExpressions.correct,
      comment: t.sessionExpressions.comment,
    })
    .from(t.sessionExpressions)
    .innerJoin(t.expressions, eq(t.expressions.id, t.sessionExpressions.expressionId))
    .where(inArray(t.sessionExpressions.sessionId, sessionIds));
}

/**
 * 練習中の表現（今回の出題以外）。自発的に使えたかを分析に判定させるため渡す。
 * 最近練習したものほど会話に出やすいので、新しい順に上限まで
 */
export function practicedExpressions(sessionId: number) {
  return db()
    .select({ ...srsColumns, text: t.expressions.text })
    .from(t.expressions)
    .where(
      and(
        inArray(t.expressions.status, LEARNING_STATUSES),
        notInArray(
          t.expressions.id,
          db()
            .select({ id: t.sessionExpressions.expressionId })
            .from(t.sessionExpressions)
            .where(eq(t.sessionExpressions.sessionId, sessionId)),
        ),
      ),
    )
    .orderBy(sql`${t.expressions.lastPracticedAt} desc nulls last`, desc(t.expressions.id))
    .limit(40);
}

const updateSrsQuery = (s: SrsState, grade: Grade, day = today()) =>
  db()
    .update(t.expressions)
    .set(schedule(s, grade, day))
    .where(eq(t.expressions.id, s.id));

const gradeOf = (r: { used: boolean; correct: boolean }): Grade =>
  r.used ? (r.correct ? "correct" : "incorrect") : "unused";

/** 使用結果の反映。target は sessionTargets の行（間隔反復の状態を含む） */
function recordUseQueries(
  sessionId: number,
  target: SrsState,
  r: { used: boolean; correct: boolean; comment: string },
) {
  return [
    db()
      .update(t.sessionExpressions)
      .set({ used: r.used, correct: r.correct, comment: r.comment })
      .where(and(eq(t.sessionExpressions.sessionId, sessionId), eq(t.sessionExpressions.expressionId, target.id))),
    updateSrsQuery(target, gradeOf(r)),
  ] as const;
}

/** 出題した表現すべての結果を反映する。分析の結果に含まれなかった表現は「使わなかった」として扱う */
export function recordTargetsQueries(
  sessionId: number,
  targets: SrsState[],
  results: { id: number; used: boolean; correct: boolean; comment: string }[],
) {
  return targets.flatMap((target) =>
    recordUseQueries(
      sessionId,
      target,
      results.find((r) => r.id === target.id) ?? { used: false, correct: false, comment: "" },
    ),
  );
}

/** 促されずに正しく使えた練習中の表現（practicedExpressions の行）を反映する */
export function recordSpontaneousQueries(items: SrsState[]) {
  return items.map((s) => updateSrsQuery(s, "spontaneous"));
}

/** 言い直し練習（FB の指摘に紐づく表現）で正しく言えた表現を反映する（練習中の表現だけ。苦手扱いも解除される）。反映したら true */
export async function recordDrillSuccess(expressionId: number) {
  const [s] = await db()
    .select(srsColumns)
    .from(t.expressions)
    .where(and(eq(t.expressions.id, expressionId), inArray(t.expressions.status, LEARNING_STATUSES)));
  if (!s) return false;
  await updateSrsQuery(s, "drill");
  return true;
}

/** 苦手（一度も使えないまま3回続けて使わなかった）表現。2週間休んだあと優先度を上げて復習に戻る（週次レビュー用） */
export function leechExpressions(limit = 10) {
  return db()
    .select()
    .from(t.expressions)
    .where(
      and(
        inArray(t.expressions.status, LEARNING_STATUSES),
        eq(t.expressions.reps, 0),
        gte(t.expressions.misses, LEECH_MISSES),
      ),
    )
    .orderBy(desc(t.expressions.misses), asc(t.expressions.id))
    .limit(limit);
}

/** 間隔反復の状態のまとめ（週次レビュー・画面用） */
export async function srsHealth() {
  const day = today();
  const rows = await db()
    .select({ ...srsColumns, kind: t.expressions.kind })
    .from(t.expressions)
    .where(inArray(t.expressions.status, [...LEARNING_STATUSES, "mastered"]));
  const learning = rows.filter((r) => r.status !== "mastered");
  const due = learning.filter((r) => r.nextReviewAt && r.nextReviewAt < jstMidnight(addDays(day, 1)));
  const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);
  return {
    learning: learning.length,
    mastered: rows.length - learning.length,
    due: due.length,
    /** 期限を3日以上過ぎたもの */
    overdue: due.filter((r) => r.nextReviewAt! < jstMidnight(addDays(day, -2))).length,
    dueNextWeek: learning.filter((r) => r.nextReviewAt && r.nextReviewAt < jstMidnight(addDays(day, 8))).length,
    leeches: learning.filter(isLeech).length,
    lapses: rows.reduce((s, r) => s + r.lapses, 0),
    neverUsed: learning.filter((r) => r.reps === 0).length,
    medianStabilityDays: median(learning.filter((r) => r.reps > 0).map((r) => r.intervalDays)),
  };
}

/** 苦手な表現カテゴリ（誤用した・使えずに終わることが続いた練習中の表現が多い順に最大3つ）。おすすめのシナリオ選びに使う */
export async function weakExpressionCategories() {
  const rows = await db()
    .select({ category: t.expressions.category, n: sql<number>`count(*)::int` })
    .from(t.expressions)
    .where(
      and(
        inArray(t.expressions.status, LEARNING_STATUSES),
        sql`(${t.expressions.status} = 'attempted' or ${t.expressions.lapses} > 0 or ${t.expressions.misses} >= 2)`,
      ),
    )
    .groupBy(t.expressions.category)
    .orderBy(sql`2 desc`, asc(t.expressions.category))
    .limit(3);
  return rows.map((r) => r.category);
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
