import { and, asc, desc, eq, inArray, lt, ne, sql } from "drizzle-orm";
import { Check, ChevronRight, Mic, Minus, Plus, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, t } from "@/db";
import type { Homework, SessionMetrics, WordAssessment } from "@/db/schema";
import { Correction } from "@/components/correction";
import { ExpressionEntry } from "@/components/expression-card";
import { ActionButton } from "@/components/action-button";
import { SpeakButton } from "@/components/speak-button";
import { JumpNav } from "@/components/jump-nav";
import { RetryDrill } from "@/components/retry-drill";
import { BackLink, Page, ScoreBar, Section } from "@/components/ui";
import { FEEDBACK_CATEGORY_LABEL, isUpgrade } from "@/lib/categories";
import { usdToJpy } from "@/lib/config";
import { sessionTargets } from "@/lib/expressions";
import { getCard, previousAttempt } from "@/lib/cards";
import { bestDrillScores } from "@/lib/drill";
import { formatDateJst, formatPhoneme, isWeakWord } from "@/lib/format";
import { getScenario } from "@/lib/scenarios";
import { isAnalysisStale } from "@/lib/session";
import { addFeedbackExpression, expressionAction, retryAnalysis } from "../../actions";
import { AnalyzingSteps, AutoRefresh, MyRecording, PurgeOldAudio } from "./client";

// 再分析（retryAnalysis の after()）がこのページの実行時間内で動くため
export const maxDuration = 300;

type Target = Awaited<ReturnType<typeof sessionTargets>>[number];

export default async function SessionPage({ params }: PageProps<"/session/[id]">) {
  const id = Number((await params).id);
  const d = db();
  const [[session], items, utterances, targets, suggested, added, [previous], drills] = await Promise.all([
    d.select().from(t.sessions).where(eq(t.sessions.id, id)),
    d
      .select()
      .from(t.feedbackItems)
      .where(eq(t.feedbackItems.sessionId, id))
      .orderBy(asc(t.feedbackItems.seq), asc(t.feedbackItems.id)),
    d.select().from(t.utterances).where(eq(t.utterances.sessionId, id)),
    sessionTargets([id]),
    // 会話後 FB で提案され、まだ採用・却下していない表現
    d.select().from(t.expressions).where(eq(t.expressions.status, "suggested")).limit(8),
    // 「覚える表現」のうち、すでに表現リストにある（提案中を除く）もの → 「追加済み」と表示
    d
      .select({ text: t.expressions.text })
      .from(t.expressions)
      .where(
        and(
          ne(t.expressions.status, "suggested"),
          inArray(
            t.expressions.text,
            d
              .select({ text: sql<string>`${t.feedbackItems.keyExpression}->>'text'` })
              .from(t.feedbackItems)
              .where(eq(t.feedbackItems.sessionId, id)),
          ),
        ),
      )
      .then((rows) => new Set(rows.map((r) => r.text))),
    // 前回（ひとつ前の完了セッション）のスコア: 計器の白抜きの印に使う
    d
      .select({ metrics: t.sessions.metrics })
      .from(t.sessions)
      .where(and(lt(t.sessions.id, id), eq(t.sessions.status, "done")))
      .orderBy(desc(t.sessions.id))
      .limit(1),
    // 言い直し練習のベスト（添削ごと）
    bestDrillScores(id),
  ]);
  if (!session) notFound();
  // お題カードで話した会話なら、そのカードと、同じお題で前に話した回（再挑戦の比較相手）
  const [cardRow, attempt] = session.cardId
    ? await Promise.all([getCard(session.cardId), previousAttempt(session.cardId, id)])
    : [null, null];
  const scenarioTitle = getScenario(session.scenarioId)?.title ?? "セッション";
  const byseq = new Map(utterances.map((u) => [u.seq, u]));
  const m = session.metrics;
  const done = session.status === "done";
  const yen = Math.round(usdToJpy(session.costUsd));
  const fixes = items.filter((it) => !isUpgrade(it.severity)).length;
  const stale = isAnalysisStale(session);

  const scorecard = m && <Scorecard m={m} prev={previous?.metrics ?? null} />;
  const checklist = targets.length > 0 && <TargetChecklist targets={targets} />;

  return (
    <Page
      rail={
        done && (
          <div className="flex flex-col gap-8">
            <div className="hidden lg:block">{scorecard}</div>
            <div className="hidden lg:block">{checklist}</div>
            <div className="border-t border-line pt-4">
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/session/new?scenario=${session.scenarioId}${cardRow ? `&card=${cardRow.id}` : ""}`}
                  className="btn"
                >
                  <RotateCcw size={15} strokeWidth={1.75} />
                  {cardRow ? "同じお題に再挑戦" : "同じシナリオでもう一度"}
                </Link>
                <Link href="/" className="btn">
                  ホームへ
                </Link>
              </div>
              <p className="meta mt-3 tabular-nums">
                {Math.round(session.durationSec / 60)}分 · 約¥{yen}
              </p>
            </div>
          </div>
        )
      }
    >
      <PurgeOldAudio />
      <BackLink />
      <h1 className="text-2xl leading-snug font-bold">{scenarioTitle}</h1>
      <p className="meta mt-0.5 mb-6 tabular-nums">
        {formatDateJst(session.startedAt, "full")} · {Math.round(session.durationSec / 60)}分
        {cardRow && ` · お題「${cardRow.card.title}」`}
      </p>

      {session.status === "analyzing" && (
        <section className="panel mb-10 px-5 py-8 text-center">
          <AutoRefresh />
          <p className="text-[17px] font-bold">フィードバックを作成しています</p>
          <p className="meta mt-1">発音データと会話を分析しています（30秒〜1分ほど）</p>
          {stale ? (
            <form action={retryAnalysis} className="mt-6">
              <p className="text-sm text-fg-2">時間がかかりすぎています。途中で止まったかもしれません。</p>
              <input type="hidden" name="id" value={id} />
              <ActionButton className="btn-primary mt-3" pendingText="分析を依頼中…">
                <RotateCcw size={16} strokeWidth={1.75} />
                もう一度分析する
              </ActionButton>
            </form>
          ) : (
            <AnalyzingSteps />
          )}
        </section>
      )}

      {session.status === "error" && (
        <form action={retryAnalysis} className="panel mb-10 px-5 py-5">
          <p className="font-bold">分析に失敗しました</p>
          <p className="meta mt-1">{session.error}</p>
          <input type="hidden" name="id" value={id} />
          {session.turns.length > 0 && (
            <ActionButton className="btn-primary mt-4" pendingText="分析を依頼中…">
              <RotateCcw size={16} strokeWidth={1.75} />
              もう一度分析する
            </ActionButton>
          )}
        </form>
      )}

      {done && (
        <>
          {/* スマホは結果（スコア）を先に、講評はその後。PC はスコアが右の欄にある */}
          {scorecard && <div className="mb-8 lg:hidden">{scorecard}</div>}
          {session.summary && <p className="mb-8 max-w-[38em] text-[16px] leading-[1.9]">{session.summary}</p>}
          {session.homework && <HomeworkResult hw={session.homework} />}
          {m && attempt?.metrics && <AttemptComparison prev={attempt} now={m} />}
          {/* 読み終えたら次にやること: 添削された言い方を声に出して言い直す */}
          {items.length > 0 && (
            <div className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Link href={`/session/${id}/drill`} className="btn-primary px-6 py-3 max-sm:w-full">
                <Mic size={17} strokeWidth={2} />
                言い直し練習（{items.length}問）
              </Link>
              <span className="meta">添削された言い方を、声に出して言い直します</span>
            </div>
          )}
          <JumpNav
            items={[
              { id: "points", label: "要点", show: Boolean(session.topPoints?.length) },
              { id: "fixes", label: `添削 ${items.length}`, show: items.length > 0 },
              { id: "targets", label: "今日の表現", show: targets.length > 0 },
              { id: "suggested", label: "覚える", show: suggested.length > 0 },
              { id: "transcript", label: "全文", show: session.turns.length > 0 },
            ]
              .filter((x) => x.show)
              .map(({ id, label }) => ({ id, label }))}
          />

          {session.topPoints && session.topPoints.length > 0 && (
            <Section id="points" title="今回の要点">
              <ol className="flex flex-col gap-4">
                {session.topPoints.map((p, i) => (
                  <li key={i} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2">
                    <span className="text-[17px] leading-snug font-bold text-accent tabular-nums">{i + 1}</span>
                    <div>
                      <div className="text-[17px] leading-snug font-bold">{p.title}</div>
                      <p className="mt-1 text-fg-2">{p.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {items.length > 0 && (
            <Section
              id="fixes"
              title="添削"
              aside={
                <span className="tabular-nums">
                  直したい点 {fixes} · より良い言い方 {items.length - fixes}
                </span>
              }
            >
              <ul className="panel divide-y divide-line">
                {items.map((it) => {
                  const key = it.keyExpression;
                  return (
                    <li key={it.id} className="px-4 py-5 sm:px-6">
                      <div className="meta mb-2 flex items-center gap-2">
                        <span className={isUpgrade(it.severity) ? "" : "font-medium text-accent"}>
                          {isUpgrade(it.severity) ? "より良い言い方" : "直したい点"}
                        </span>
                        <span>·</span>
                        <span>{FEEDBACK_CATEGORY_LABEL[it.category]}</span>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <Correction original={it.original} improved={it.improved} upgrade={isUpgrade(it.severity)} />
                        <SpeakButton text={it.improved} />
                      </div>
                      <p className="mt-2.5 max-w-[38em] text-fg-2">{it.explanation}</p>
                      <RetryDrill
                        itemId={it.id}
                        sessionId={id}
                        seq={it.seq}
                        original={it.seq == null ? null : (byseq.get(it.seq)?.accuracy ?? null)}
                        best={drills.get(it.id) ?? null}
                      />
                      {key && (
                        <form
                          action={addFeedbackExpression.bind(null, {
                            ...key,
                            example: it.improved,
                            scene: scenarioTitle,
                          })}
                          className="mt-3 flex items-center justify-between gap-3 rounded-[10px] bg-primary-soft/70 px-3.5 py-2.5"
                        >
                          <div className="min-w-0 text-sm">
                            <span className="mr-2 text-xs font-bold text-primary">覚える</span>
                            <b>{key.text}</b>
                            <span className="text-fg-2"> — {key.meaning}</span>
                          </div>
                          {added.has(key.text) ? (
                            <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-good">
                              <Check size={15} strokeWidth={2} />
                              追加済み
                            </span>
                          ) : (
                            <ActionButton className="btn shrink-0 border-primary/30 px-2.5 py-1 text-[13px] text-primary">
                              <Plus size={14} strokeWidth={2} />
                              追加
                            </ActionButton>
                          )}
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          {checklist && (
            <div id="targets" className="mb-10 scroll-mt-16 lg:hidden">
              {checklist}
            </div>
          )}

          {suggested.length > 0 && (
            <Section id="suggested" title="覚えておきたい表現" aside={`${suggested.length}件の提案`}>
              <div className="divide-y divide-line border-y border-line">
                {suggested.map((e) => (
                  <ExpressionEntry key={e.id} e={e} status="提案">
                    <form action={expressionAction} className="flex gap-2">
                      <input type="hidden" name="id" value={e.id} />
                      <ActionButton name="action" value="adopt" className="btn-primary px-4 py-2 text-sm">
                        <Plus size={15} strokeWidth={2} />
                        覚えるリストへ
                      </ActionButton>
                      <ActionButton
                        name="action"
                        value="delete"
                        className="btn-ghost px-2.5"
                        aria-label="この提案を消す"
                      >
                        <X size={16} strokeWidth={1.75} />
                        不要
                      </ActionButton>
                    </form>
                  </ExpressionEntry>
                ))}
              </div>
            </Section>
          )}
        </>
      )}

      {session.turns.length > 0 && (
        <details id="transcript" className="group scroll-mt-16 border-t border-line" open={!done}>
          <summary className="flex items-center gap-2 py-4 text-[17px] font-bold">
            <ChevronRight size={18} strokeWidth={1.75} className="transition-transform group-open:rotate-90" />
            会話の全文と発音
            <span className="meta font-normal">{session.turns.filter((x) => x.role === "user").length}回の発話</span>
          </summary>
          <div className="flex flex-col gap-5 pb-4">
            {session.turns.map((turn, i) =>
              turn.role === "assistant" ? (
                <p key={i} className="max-w-[88%] text-fg-2">
                  {turn.text}
                </p>
              ) : (
                <div
                  key={i}
                  className="ml-auto w-full max-w-[92%] rounded-[14px] border border-line bg-surface px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[16px] leading-relaxed">{turn.text}</p>
                    <MyRecording sessionId={id} seq={turn.seq!} />
                  </div>
                  <Pronunciation words={byseq.get(turn.seq!)?.words ?? []} />
                </div>
              ),
            )}
          </div>
        </details>
      )}
    </Page>
  );
}

/** 発音の詳細（折りたたみ）: 気になる語だけに印を付ける */
function Pronunciation({ words }: { words: WordAssessment[] }) {
  if (!words.length) return null;
  const weak = words.filter(isWeakWord).sort((a, b) => a.accuracy - b.accuracy);
  return (
    <details className="group/p mt-2">
      <summary className="meta inline-flex items-center gap-1 hover:text-fg">
        <ChevronRight size={14} strokeWidth={1.75} className="transition-transform group-open/p:rotate-90" />
        発音の詳細{weak.length > 0 && `（気になる語 ${weak.length}）`}
      </summary>
      <p className="mt-2 text-[15px] leading-loose">
        {words.map((w, i) => (
          <span key={i}>
            {i > 0 && " "}
            <span
              title={`${Math.round(w.accuracy)}点 ${w.weakPhonemes.map(formatPhoneme).join(" ")}`}
              className={
                w.accuracy < 65
                  ? "rounded-sm bg-accent-soft underline decoration-accent decoration-[1.5px] underline-offset-4"
                  : w.accuracy < 85
                    ? "underline decoration-warn decoration-dotted decoration-[1.5px] underline-offset-4"
                    : ""
              }
            >
              {w.word}
            </span>
          </span>
        ))}
      </p>
      {weak.length > 0 && (
        <ul className="meta mt-2 flex flex-col gap-0.5">
          {weak.slice(0, 3).map((w, i) => (
            <li key={i} className="tabular-nums">
              <b className="font-medium text-fg">{w.word}</b> {Math.round(w.accuracy)}点{" "}
              {w.weakPhonemes.map(formatPhoneme).join(" ")}
            </li>
          ))}
        </ul>
      )}
      <p className="meta mt-2">聞き取られた語を表示しています。下線: 点線＝やや不明瞭、実線＝聞き取りにくい</p>
    </details>
  );
}

/** 前回の宿題（前回の要点の1つ目）を今回生かせたか。緑＝できた、黄土＝まだ */
function HomeworkResult({ hw }: { hw: Homework }) {
  return (
    <div className="mb-8 grid max-w-[38em] grid-cols-[1.25rem_minmax(0,1fr)] gap-x-2 border-y border-line py-3">
      <span className="pt-1">
        {hw.applied ? (
          <Check size={15} strokeWidth={2.25} className="text-good" />
        ) : (
          <span className="text-[13px] font-bold text-warn">△</span>
        )}
      </span>
      <div className="min-w-0">
        <p className="text-sm">
          <span className="font-bold">前回の宿題</span>
          <span className="text-fg-2">「{hw.title}」</span>
          <span className={`font-bold ${hw.applied ? "text-good" : "text-warn"}`}>
            {hw.applied ? "できました" : "もう一歩"}
          </span>
        </p>
        {hw.comment && <p className="meta mt-0.5">{hw.comment}</p>}
      </div>
    </div>
  );
}

const round = (v: number | null) => (v == null ? "—" : Math.round(v * 10) / 10);

function Scorecard({ m, prev }: { m: SessionMetrics; prev: SessionMetrics | null }) {
  return (
    <div>
      <div className="flex items-end gap-5">
        <div>
          <div className="text-[32px] leading-none font-bold">{m.estimatedCefr || "—"}</div>
          <div className="meta mt-1">推定レベル</div>
        </div>
        <dl className="meta grid grid-cols-[auto_auto] gap-x-2 tabular-nums">
          <dt>話す速さ</dt>
          <dd className="font-medium text-fg">{m.wpm > 0 ? `${m.wpm} wpm` : "—"}</dd>
          <dt>誤り</dt>
          <dd className="font-medium text-fg">{round(m.errorsPer100Words)} / 100語</dd>
        </dl>
      </div>
      <div className="mt-5 flex flex-col gap-1">
        <ScoreBar label="発音" value={m.accuracy} prev={prev?.accuracy} />
        <ScoreBar label="流暢さ" value={m.fluency} prev={prev?.fluency} />
        <ScoreBar label="抑揚" value={m.prosody} prev={prev?.prosody} />
      </div>
      <p className="meta mt-2">縦線＝目標80{prev && "　○＝前回"}</p>
    </div>
  );
}

function TargetChecklist({ targets }: { targets: Target[] }) {
  const used = targets.filter((x) => x.used && x.correct).length;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-[15px] font-bold">今日の表現</h2>
        <span className="meta tabular-nums">
          {used} / {targets.length} 使えた
        </span>
      </div>
      <ul className="divide-y divide-line">
        {targets.map((x) => (
          <li key={x.id} className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-2 py-2.5">
            <span className="pt-1">
              {x.used ? (
                x.correct ? (
                  <Check size={15} strokeWidth={2.25} className="text-good" />
                ) : (
                  <span className="text-[13px] font-bold text-warn">△</span>
                )
              ) : (
                <Minus size={15} strokeWidth={1.75} className="text-muted" />
              )}
            </span>
            <div className="min-w-0">
              <div className={`text-sm font-bold ${x.used ? "" : "text-fg-2"}`}>{x.text}</div>
              {x.comment && <p className="meta">{x.comment}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 再挑戦で比べる指標（higher: 大きいほど良い） */
const COMPARE: {
  label: string;
  get: (m: SessionMetrics) => number | null | undefined;
  fmt: (v: number) => string;
  higher: boolean;
  /** これ未満の差は「変わらず」とみなす */
  noise: number;
}[] = [
  {
    label: "話す速さ",
    get: (m) => (m.wpm > 0 ? m.wpm : null),
    fmt: (v) => `${Math.round(v)} wpm`,
    higher: true,
    noise: 5,
  },
  {
    label: "誤りのない節",
    get: (m) => m.errorFreeClauseRatio,
    fmt: (v) => `${Math.round(v * 100)}%`,
    higher: true,
    noise: 0.03,
  },
  {
    label: "話し始めるまで",
    get: (m) => m.medianLatencyMs,
    fmt: (v) => `${(v / 1000).toFixed(1)}秒`,
    higher: false,
    noise: 200,
  },
  { label: "発音", get: (m) => m.accuracy, fmt: (v) => `${Math.round(v)}`, higher: true, noise: 2 },
  { label: "流暢さ", get: (m) => m.fluency, fmt: (v) => `${Math.round(v)}`, higher: true, noise: 2 },
  { label: "抑揚", get: (m) => m.prosody, fmt: (v) => `${Math.round(v)}`, higher: true, noise: 2 },
];

/** 同じお題の前回と今回を並べる（成長が見えるように） */
function AttemptComparison({
  prev,
  now,
}: {
  prev: { startedAt: Date; metrics: SessionMetrics | null; topPoints: { title: string }[] | null };
  now: SessionMetrics;
}) {
  const rows = COMPARE.flatMap((c) => {
    const a = prev.metrics ? c.get(prev.metrics) : null;
    const b = c.get(now);
    return a == null || b == null ? [] : [{ ...c, a, b }];
  });
  if (!rows.length) return null;
  const better = rows.filter((r) => Math.abs(r.b - r.a) >= r.noise && r.b > r.a === r.higher).length;
  return (
    <section className="panel mb-8 px-5 py-4" aria-labelledby="compare-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id="compare-title" className="text-[15px] font-bold">
          前回（{formatDateJst(prev.startedAt)}）との比較
        </h2>
        <span className="meta">
          {rows.length}項目中 {better}項目が良くなりました
        </span>
      </div>
      <table className="mt-2 w-full text-sm tabular-nums">
        <tbody>
          {rows.map((r) => {
            const diff = r.b - r.a;
            const tone = Math.abs(diff) < r.noise ? "text-muted" : diff > 0 === r.higher ? "text-good" : "text-accent";
            return (
              <tr key={r.label} className="border-b border-line last:border-b-0">
                <td className="py-2 text-fg-2">{r.label}</td>
                <td className="py-2 text-right text-muted">{r.fmt(r.a)}</td>
                <td className="w-6 py-2 text-center text-muted">→</td>
                <td className="py-2 text-right font-bold">{r.fmt(r.b)}</td>
                <td className={`w-20 py-2 text-right text-[13px] font-medium ${tone}`}>
                  {Math.abs(diff) < r.noise ? "変わらず" : diff > 0 === r.higher ? "良くなった" : "下がった"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {prev.topPoints?.[0] && (
        <p className="meta mt-3">
          前回の一番の課題: <b className="font-medium text-fg">{prev.topPoints[0].title}</b>
        </p>
      )}
    </section>
  );
}
