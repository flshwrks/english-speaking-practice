import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { and, desc, eq, gte, notExists, sql } from "drizzle-orm";
import { z } from "zod";
import { db, t } from "@/db";
import type { ScenarioCard } from "@/db/schema";
import { PRICING } from "./config";
import { getProfile } from "./lesson";
import type { Scenario } from "./scenarios";

/**
 * お題カード: 会話ごとに状況・役・使える事実・ゴールを作る。
 * - 学生でも作り話をせずに話せるよう、ビジネスの場面では役と事実をカードで渡す（自分として話す場面は役なし）
 * - 過去のお題を渡して、業界・国・切り口が重ならないようにする
 * - 再挑戦では同じカードをもう一度使う（前回と比べるため）
 */

export type Card = { id: number; scenarioId: string; card: ScenarioCard; createdAt: Date };

const CardSchema = z.object({
  title: z.string().describe("今回のお題（日本語, 20字以内）"),
  situation: z.string().describe("状況（日本語, 2〜3文）"),
  role: z.string().nullable().describe("学習者の役（日本語, 1文）。自分として話す場面は null"),
  facts: z.array(z.string()).describe("会話で使える事実・論点（日本語, 3〜5個。具体的な数字・名前・制約を含める）"),
  goal: z.string().describe("この会話で学習者が目指すこと（日本語, 1文）"),
  partner: z
    .string()
    .describe(
      "For the AI partner (English, 3-5 sentences): who they are in this scene, what they know and want, one concern or constraint that creates real discussion, and how to open.",
    ),
  topic: z.string().describe("Short English tag of the topic for de-duplication (3-6 words)"),
});

const SYSTEM = `You design one card for a spoken English role-play lesson. The learner is a Japanese university student preparing for global business.
The card sets the scene so the learner never has to invent a job or biography on the spot, and makes every session different.

Rules:
- Mode "roleplay": give the learner a concrete, believable junior role (intern, new graduate hire, junior analyst, coordinator...) at a specific kind of company, and put every fact they need on the card (numbers, dates, names, constraints). Never make them a senior manager.
- Mode "self": the learner speaks as themselves, using their real profile. role must be null. facts are the topic material, not facts about the learner: interview focus areas and likely questions, the case prompt with a few numbers, the discussion proposition with possible angles, or aspects the partner will probe.
- Make it different from the recent topics listed: vary industry (manufacturing, logistics, IT/SaaS, consulting, trading, finance, energy, consumer goods, healthcare, travel...), country and angle, and sometimes use current business themes (AI adoption, supply-chain diversification, ESG, remote work, inflation, aging workforce...). Where it fits naturally, connect to the learner's interests.
- Scale the complexity to the conversation level (1-10): lower levels get simpler situations and fewer facts.
- Keep it realistic and specific. The partner text must give the AI partner a real stake (a concern, a constraint, a counter-position) so the conversation has something to work through.
- Japanese fields must read naturally.`;

async function recentTopics(scenarioId: string) {
  const rows = await db()
    .select({ scenarioId: t.scenarioCards.scenarioId, topic: sql<string>`${t.scenarioCards.card}->>'topic'` })
    .from(t.scenarioCards)
    .orderBy(desc(t.scenarioCards.id))
    .limit(20);
  // 同じシナリオのお題を優先して見せる（ほかのシナリオは業界の偏りを避けるための参考）
  return [...rows.filter((r) => r.scenarioId === scenarioId), ...rows.filter((r) => r.scenarioId !== scenarioId)]
    .slice(0, 15)
    .map((r) => r.topic);
}

/** お題カードを新しく作って保存する */
export async function generateCard(scenario: Scenario): Promise<Card> {
  const [profile, topics] = await Promise.all([getProfile(), recentTopics(scenario.id)]);
  const userText = `# Scenario
Title: ${scenario.title} — ${scenario.brief}
Mode: ${scenario.mode}
Partner role: ${scenario.role}
Conversation level: ${profile.level}/10

# Learner profile
${
  [profile.about, profile.goals && `Goal: ${profile.goals}`, profile.interests && `Interests: ${profile.interests}`]
    .filter(Boolean)
    .join("\n") || "(none)"
}

# Recent topics (make this one different)
${topics.map((x) => `- ${x}`).join("\n") || "(none yet)"}`;

  const response = await new Anthropic().messages.parse({
    model: PRICING.cards.model,
    max_tokens: 2000,
    output_config: { format: zodOutputFormat(CardSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content: userText }],
  });
  const card = response.parsed_output;
  if (!card) throw new Error(`お題カードを作れませんでした (stop_reason: ${response.stop_reason})`);
  if (scenario.mode === "self") card.role = null;
  card.facts = card.facts.slice(0, 5);
  const costUsd =
    (response.usage.input_tokens * PRICING.cards.input + response.usage.output_tokens * PRICING.cards.output) /
    1_000_000;
  const [row] = await db().insert(t.scenarioCards).values({ scenarioId: scenario.id, card, costUsd }).returning();
  return row;
}

const unused = notExists(
  db()
    .select({ one: sql`1` })
    .from(t.sessions)
    .where(eq(t.sessions.cardId, t.scenarioCards.id)),
);

/** 今日作ってまだ使っていないカード（準備画面を開き直しても同じお題にするため） */
async function freshCard(scenarioId: string) {
  const [row] = await db()
    .select()
    .from(t.scenarioCards)
    .where(
      and(
        eq(t.scenarioCards.scenarioId, scenarioId),
        gte(t.scenarioCards.createdAt, sql`now() - interval '1 day'`),
        unused,
      ),
    )
    .orderBy(desc(t.scenarioCards.id))
    .limit(1);
  return row ?? null;
}

export async function getCard(id: number) {
  const [row] = await db().select().from(t.scenarioCards).where(eq(t.scenarioCards.id, id));
  return row ?? null;
}

/**
 * 準備画面で使うカード。指定があればそれ（再挑戦）、なければ今日の未使用のもの、なければ新しく作る。
 * カードを作らない場面（レベル診断）は null
 */
export async function cardFor(scenario: Scenario, requestedId?: number): Promise<Card | null> {
  if (scenario.noCard) return null;
  if (requestedId) {
    const card = await getCard(requestedId);
    if (card?.scenarioId === scenario.id) return card;
  }
  return (await freshCard(scenario.id)) ?? generateCard(scenario);
}

/** ホームを開いたときに、今日のおすすめのカードを先に作っておく（準備画面をすぐ開けるように） */
export async function prepareCard(scenario: Scenario) {
  if (scenario.noCard || (await freshCard(scenario.id))) return;
  await generateCard(scenario);
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
