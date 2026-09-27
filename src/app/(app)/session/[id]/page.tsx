import { and, asc, desc, eq, inArray, lt, ne, sql } from "drizzle-orm";
import { Check, ChevronRight, Minus, Plus, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, t } from "@/db";
import type { SessionMetrics, WordAssessment } from "@/db/schema";
import { ExpressionEntry } from "@/components/expression-card";
import { ActionButton } from "@/components/action-button";
import { SpeakButton } from "@/components/speak-button";
import { BackLink, Page, ScoreBar, Section } from "@/components/ui";
import { FEEDBACK_CATEGORY_LABEL, isUpgrade } from "@/lib/categories";
import { usdToJpy } from "@/lib/config";
import { sessionTargets } from "@/lib/expressions";
import { formatDateJst, formatPhoneme, isWeakWord } from "@/lib/format";
import { getScenario } from "@/lib/scenarios";
import { diffWords, isRewrite } from "@/lib/typeset";
import { addFeedbackExpression, expressionAction, retryAnalysis } from "../../actions";
import { AnalyzingSteps, AutoRefresh, MyRecording, PurgeOldAudio } from "./client";

// 再分析（retryAnalysis の after()）がこのページの実行時間内で動くため
export const maxDuration = 300;

type Target = Awaited<ReturnType<typeof sessionTargets>>[number];

export default async function SessionPage({ params }: PageProps<"/session/[id]">) {
  const id = Number((await params).id);
  const d = db();
  const [[session], items, utterances, targets, suggested, added, [previous]] = await Promise.all([
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
  ]);
  if (!session) notFound();
  const scenarioTitle = getScenario(session.scenarioId)?.title ?? "セッション";
  const byseq = new Map(utterances.map((u) => [u.seq, u]));
  const m = session.metrics;
  const done = session.status === "done";
  const yen = Math.round(usdToJpy(session.costUsd));
  const fixes = items.filter((it) => !isUpgrade(it.severity)).length;

  const scorecard = m && <Scorecard m={m} prev={previous?.metrics ?? null} />;
  const checklist = targets.length > 0 && <TargetChecklist targets={targets} />;

  return (
    <Page
      rail={
        done && (
          <div className="flex flex-col gap-8">
            <div className="hidden lg:block">{scorecard}</div>
            <div className="hidden lg:block">{checklist}</div>
            <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
              <span className="meta tabular-nums">
                {Math.round(session.durationSec / 60)}分 · 約¥{yen}
              </span>
              <Link href="/" className="btn">
                ホームへ
              </Link>
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
      </p>

      {session.status === "analyzing" && (
        <section className="panel mb-10 px-5 py-8 text-center">
          <AutoRefresh />
          <p className="text-[17px] font-bold">フィードバックを作成しています</p>
          <p className="meta mt-1">発音データと会話を分析しています（30秒〜1分ほど）</p>
          <AnalyzingSteps />
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
          {session.summary && <p className="mb-8 max-w-[38em] text-[16px] leading-[1.9]">{session.summary}</p>}
          {scorecard && <div className="mb-8 lg:hidden">{scorecard}</div>}
          <nav
            aria-label="このページの中を移動"
            className="sticky top-0 z-10 -mx-4 mb-8 flex gap-1 overflow-x-auto border-b border-line bg-bg/95 px-4 py-2 backdrop-blur [scrollbar-width:none] lg:hidden"
          >
            {[
              { href: "#points", label: "要点", show: Boolean(session.topPoints?.length) },
              { href: "#fixes", label: `添削 ${items.length}`, show: items.length > 0 },
              { href: "#targets", label: "今日の表現", show: targets.length > 0 },
              { href: "#suggested", label: "覚える", show: suggested.length > 0 },
              { href: "#transcript", label: "全文", show: session.turns.length > 0 },
            ]
              .filter((x) => x.show)
              .map((x) => (
                <a
                  key={x.href}
                  href={x.href}
                  className="shrink-0 rounded-full px-3 py-1 text-[13px] font-medium whitespace-nowrap text-fg-2 transition-colors hover:bg-surface active:bg-primary-soft active:text-primary"
                >
                  {x.label}
                </a>
              ))}
          </nav>

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

/** 赤ペン添削: 残す語はそのまま、消す語に線、足す語は太字。ほぼ全部入れ替えなら2行に分ける */
function Correction({ original, improved, upgrade }: { original: string; improved: string; upgrade: boolean }) {
  const parts = diffWords(original, improved);
  const del = upgrade
    ? "text-muted line-through decoration-muted"
    : "text-fg-2 line-through decoration-accent decoration-[1.5px]";
  const ins = upgrade
    ? "font-bold underline decoration-line-strong underline-offset-4"
    : "rounded-sm bg-accent-soft px-0.5 font-bold";
  if (isRewrite(parts)) {
    return (
      <div className="min-w-0 text-[17px] leading-relaxed">
        <p className={del}>{original}</p>
        <p className="mt-0.5 font-bold">{improved}</p>
      </div>
    );
  }
  return (
    <p className="min-w-0 text-[17px] leading-relaxed">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && " "}
          <span className={p.op === "del" ? del : p.op === "ins" ? ins : ""}>{p.text}</span>
        </span>
      ))}
    </p>
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
          <dd className="font-medium text-fg">{m.wpm} wpm</dd>
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
