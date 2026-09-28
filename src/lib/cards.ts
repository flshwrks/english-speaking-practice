import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db, t } from "@/db";
import type { ScenarioCard } from "@/db/schema";
import type { Scenario } from "./scenarios";

/**
 * お題カード: 会話ごとの状況・役・使える事実・ゴール。data/cards.json にシナリオごとに用意したものから選ぶ（アプリの中では作らない）。
 * - まだ話していないカードから順に出す。全部話したら、一番前に話したカードに戻る（自然に再挑戦になり、前回と比べられる）
 * - 再挑戦では同じカードをもう一度使う
 */

export type Card = { id: number; scenarioId: string; slug: string | null; card: ScenarioCard; createdAt: Date };

/** カードの段階（シナリオの何枚目か）。data/cards.json の並び順＝ステップ1から少しずつ難しくなる */
export const cardStep = (card: Pick<Card, "slug">) => Number(card.slug?.split("-").at(-1)) || null;

/** そのシナリオのカードを出す順に: まだ話していないもの（用意した順）→ 話したもの（最後に話したのが古い順） */
function cardsInOrder(scenarioId: string) {
  const lastUsed = sql`(select max(${t.sessions.startedAt}) from ${t.sessions} where ${t.sessions.cardId} = ${t.scenarioCards.id})`;
  return db()
    .select({
      id: t.scenarioCards.id,
      scenarioId: t.scenarioCards.scenarioId,
      slug: t.scenarioCards.slug,
      card: t.scenarioCards.card,
      createdAt: t.scenarioCards.createdAt,
    })
    .from(t.scenarioCards)
    .where(and(eq(t.scenarioCards.scenarioId, scenarioId), isNotNull(t.scenarioCards.slug)))
    .orderBy(sql`${lastUsed} asc nulls first`, asc(t.scenarioCards.slug));
}

export async function getCard(id: number): Promise<Card | null> {
  const [row] = await db().select().from(t.scenarioCards).where(eq(t.scenarioCards.id, id));
  return row ?? null;
}

/** 準備画面で使うカード。指定があればそれ（再挑戦・別のお題）、なければ次に出す順の先頭。カードのない場面（レベル診断）は null */
export async function cardFor(scenario: Scenario, requestedId?: number): Promise<Card | null> {
  if (scenario.noCard) return null;
  if (requestedId) {
    const card = await getCard(requestedId);
    if (card?.scenarioId === scenario.id) return card;
  }
  const [first] = await cardsInOrder(scenario.id);
  return first ?? null;
}

/** 「別のお題にする」: 出す順で今のカードの次（最後まで行ったら先頭に戻る） */
export async function nextCard(scenarioId: string, currentId: number) {
  const list = await cardsInOrder(scenarioId);
  if (!list.length) return null;
  return list[(list.findIndex((c) => c.id === currentId) + 1) % list.length];
}

/** 同じお題で前に話したセッション（再挑戦の比べる相手）。今のセッションより前で一番新しいもの */
export async function previousAttempt(cardId: number, beforeSessionId: number) {
  const [row] = await db()
    .select({
      id: t.sessions.id,
      startedAt: t.sessions.startedAt,
      metrics: t.sessions.metrics,
      topPoints: t.sessions.topPoints,
    })
    .from(t.sessions)
    .where(
      and(eq(t.sessions.cardId, cardId), eq(t.sessions.status, "done"), sql`${t.sessions.id} < ${beforeSessionId}`),
    )
    .orderBy(desc(t.sessions.id))
    .limit(1);
  return row ?? null;
}

/**
 * ホームで勧める再挑戦: 12〜45日前に話したお題のうち、その後もう一度話していない一番古いもの
 */
export async function retryCandidate() {
  const rows = await db()
    .select({
      cardId: t.sessions.cardId,
      scenarioId: t.sessions.scenarioId,
      startedAt: t.sessions.startedAt,
      title: sql<string>`${t.scenarioCards.card}->>'title'`,
    })
    .from(t.sessions)
    .innerJoin(t.scenarioCards, eq(t.scenarioCards.id, t.sessions.cardId))
    .where(
      and(
        eq(t.sessions.status, "done"),
        sql`${t.sessions.startedAt} between now() - interval '45 days' and now() - interval '12 days'`,
        sql`not exists (select 1 from ${t.sessions} s2 where s2.card_id = ${t.sessions.cardId} and s2.id > ${t.sessions.id})`,
      ),
    )
    .orderBy(t.sessions.startedAt)
    .limit(1);
  return rows[0] ?? null;
}

/** そのお題で話した回数と最後の日（準備画面で「再挑戦」と分かるように） */
export async function cardUsage(cardId: number) {
  const [row] = await db()
    .select({ count: sql<number>`count(*)::int`, lastAt: sql<Date | null>`max(${t.sessions.startedAt})` })
    .from(t.sessions)
    .where(and(eq(t.sessions.cardId, cardId), eq(t.sessions.status, "done")));
  return { count: row?.count ?? 0, lastAt: row?.lastAt ? new Date(row.lastAt) : null };
}

/**
 * シナリオごとのカードの進み具合: 用意した枚数と、話し終えたカードの枚数（カリキュラムで「何枚目まで進んだか」を見せる）
 */
export async function cardProgress() {
  const rows = await db()
    .select({
      scenarioId: t.scenarioCards.scenarioId,
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where exists (select 1 from ${t.sessions} where ${t.sessions.cardId} = ${t.scenarioCards.id} and ${t.sessions.status} = 'done'))::int`,
    })
    .from(t.scenarioCards)
    .where(isNotNull(t.scenarioCards.slug))
    .groupBy(t.scenarioCards.scenarioId);
  return new Map(rows.map((r) => [r.scenarioId, { total: r.total, done: r.done }]));
}
