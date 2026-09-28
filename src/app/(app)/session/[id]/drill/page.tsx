import { asc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db, t } from "@/db";
import { BackLink, Page } from "@/components/ui";
import { FEEDBACK_CATEGORY_LABEL, isUpgrade } from "@/lib/categories";
import { bestDrillScores, DRILL_CLEAR_SCORE } from "@/lib/drill";
import { getScenario } from "@/lib/scenarios";
import { DrillRunner, type DrillItem } from "./client";

const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * 言い直し練習: 添削を1件ずつ、答え（改善後の文）を隠したまま思い出して言う。
 * 手がかりは自分の元の発言と解説だけ。採点のあとでお手本を見せる。
 */
export default async function DrillPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const d = db();
  const [[session], items, utterances, best] = await Promise.all([
    d
      .select({ status: t.sessions.status, scenarioId: t.sessions.scenarioId })
      .from(t.sessions)
      .where(eq(t.sessions.id, id)),
    d
      .select()
      .from(t.feedbackItems)
      .where(eq(t.feedbackItems.sessionId, id))
      .orderBy(asc(t.feedbackItems.seq), asc(t.feedbackItems.id)),
    d
      .select({ seq: t.utterances.seq, accuracy: t.utterances.accuracy })
      .from(t.utterances)
      .where(eq(t.utterances.sessionId, id)),
    bestDrillScores(id),
  ]);
  if (!session) notFound();
  if (session.status !== "done" || !items.length) redirect(`/session/${id}`);
  const accuracy = new Map(utterances.map((u) => [u.seq, u.accuracy]));

  const drill: DrillItem[] = items.map((it) => ({
    id: it.id,
    seq: it.seq,
    label: `${isUpgrade(it.severity) ? "より良い言い方" : "直したい点"} · ${FEEDBACK_CATEGORY_LABEL[it.category]}`,
    upgrade: isUpgrade(it.severity),
    original: it.original,
    improved: it.improved,
    // 解説に答えの文がそのまま入っているなら、手がかりには出さない
    cue: flat(it.explanation).includes(flat(it.improved)) ? null : it.explanation,
    originalScore: it.seq == null ? null : (accuracy.get(it.seq) ?? null),
    best: best.get(it.id) ?? null,
  }));

  return (
    <Page narrow>
      <BackLink href={`/session/${id}`} label="フィードバック" />
      <h1 className="text-2xl leading-snug font-bold">言い直し練習</h1>
      <p className="meta mt-0.5 mb-6">
        {getScenario(session.scenarioId)?.title ?? "セッション"} · 添削{items.length}件を、答えを見ずに言い直す
      </p>
      <DrillRunner sessionId={id} items={drill} clearScore={DRILL_CLEAR_SCORE} />
    </Page>
  );
}
