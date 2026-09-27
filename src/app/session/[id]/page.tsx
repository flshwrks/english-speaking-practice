import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { ArrowRight, BookmarkCheck, BookmarkPlus, Check, Minus, Plus, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, t } from "@/db";
import type { WordAssessment } from "@/db/schema";
import { ExpressionCard } from "@/components/expression-card";
import { SpeakButton } from "@/components/speak-button";
import { Badge, Header, Page, ScoreRing, scoreColor, SectionTitle, Stat, StatRow } from "@/components/ui";
import { FEEDBACK_CATEGORY_LABEL, isUpgrade } from "@/lib/categories";
import { usdToJpy } from "@/lib/config";
import { sessionTargets } from "@/lib/expressions";
import { formatDateJst, formatPhoneme, isWeakWord } from "@/lib/format";
import { getScenario } from "@/lib/scenarios";
import { addFeedbackExpression, expressionAction, retryAnalysis } from "../../actions";
import { AnalyzingSteps, AutoRefresh, MyRecording, PurgeOldAudio } from "./client";

// 再分析（retryAnalysis の after()）がこのページの実行時間内で動くため
export const maxDuration = 300;

export default async function SessionPage({ params }: PageProps<"/session/[id]">) {
  const id = Number((await params).id);
  const d = db();
  const [[session], items, utterances, targets, suggested, added] = await Promise.all([
    d.select().from(t.sessions).where(eq(t.sessions.id, id)),
    d.select().from(t.feedbackItems).where(eq(t.feedbackItems.sessionId, id)).orderBy(asc(t.feedbackItems.id)),
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
  ]);
  if (!session) notFound();
  const scenarioTitle = getScenario(session.scenarioId)?.title ?? "セッション";
  const byseq = new Map(utterances.map((u) => [u.seq, u]));
  const m = session.metrics;
  const yen = Math.round(usdToJpy(session.costUsd));
  const usedCount = targets.filter((x) => x.used && x.correct).length;

  return (
    <Page>
      <PurgeOldAudio />
      <Header eyebrow={`Feedback / ${formatDateJst(session.startedAt, "full")}`} title={scenarioTitle} />

      {session.status === "analyzing" && (
        <section className="mb-10 border-y border-line py-12 text-center">
          <AutoRefresh />
          <p className="font-serif text-3xl italic">Reviewing your session…</p>
          <p className="mt-2 text-sm text-muted">発音データと会話を分析しています（30秒〜1分ほど）</p>
          <AnalyzingSteps />
        </section>
      )}

      {session.status === "error" && (
        <form action={retryAnalysis} className="mb-10 border-l-2 border-bad bg-surface px-5 py-5">
          <p className="font-bold">分析に失敗しました</p>
          <p className="mt-1 text-sm text-muted">{session.error}</p>
          <input type="hidden" name="id" value={id} />
          {session.turns.length > 0 && (
            <button className="btn-primary mt-4">
              <RotateCcw size={15} />
              もう一度分析する
            </button>
          )}
        </form>
      )}

      {session.status === "done" && (
        <>
          {/* 結果の要約 */}
          <section className="mb-12 animate-rise">
            <p className="max-w-2xl text-[17px] leading-[1.9] sm:text-lg">{session.summary}</p>
            {m && (
              <div className="mt-8">
                <StatRow cols={3}>
                  <Stat label="CEFR" value={m.estimatedCefr ?? "—"} sub="推定レベル" />
                  <Stat label="WPM" value={m.wpm} sub="話す速さ" />
                  <Stat label="Errors" value={m.errorsPer100Words} sub="100語あたりの誤り" />
                </StatRow>
                <div className="mt-8 grid grid-cols-3 gap-5 sm:gap-8">
                  <ScoreRing label="Accuracy" value={m.accuracy} />
                  <ScoreRing label="Fluency" value={m.fluency} />
                  <ScoreRing label="Prosody" value={m.prosody} />
                </div>
              </div>
            )}
          </section>

          {session.topPoints && session.topPoints.length > 0 && (
            <section className="mb-12">
              <SectionTitle index="01">今回の要点</SectionTitle>
              <ol className="border-t border-line">
                {session.topPoints.map((p, i) => (
                  <li key={i} className="flex gap-5 border-b border-line py-5">
                    <span className="numeral w-8 shrink-0 text-3xl text-accent">{i + 1}</span>
                    <div className="min-w-0">
                      <div className="font-bold">{p.title}</div>
                      <p className="mt-1 text-sm leading-relaxed text-muted">{p.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {targets.length > 0 && (
            <section className="mb-12">
              <SectionTitle
                index="02"
                aside={
                  <span className="font-mono">
                    {usedCount}/{targets.length} used
                  </span>
                }
              >
                今日の表現
              </SectionTitle>
              <ul className="border-t border-line">
                {targets.map((x) => (
                  <li key={x.id} className="flex gap-3 border-b border-line py-3.5">
                    <span className="mt-0.5 shrink-0">
                      {x.used ? (
                        x.correct ? (
                          <Check size={17} className="text-good" />
                        ) : (
                          <span className="font-mono text-xs font-bold text-warn">±</span>
                        )
                      ) : (
                        <Minus size={17} className="text-line-strong" />
                      )}
                    </span>
                    <div className="min-w-0 text-sm">
                      <b className={x.used ? "" : "text-muted"}>{x.text}</b>
                      {x.comment && <p className="mt-0.5 text-muted">{x.comment}</p>}
                    </div>
                    <span className="ml-auto shrink-0 font-mono text-[11px] text-muted">
                      {x.used ? (x.correct ? "USED" : "ALMOST") : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <section className="mb-12">
        <SectionTitle index={session.status === "done" ? "03" : undefined}>会話とフィードバック</SectionTitle>
        <div className="flex flex-col gap-4">
          {session.turns.map((turn, i) =>
            turn.role === "assistant" ? (
              <div key={i} className="max-w-[85%] self-start">
                <div className="eyebrow mb-1">Partner</div>
                <p className="border-l border-line-strong pl-3 text-sm leading-relaxed text-muted">{turn.text}</p>
              </div>
            ) : (
              <div key={i} className="card p-4 sm:p-5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="eyebrow text-fg">You</span>
                  <MyRecording sessionId={id} seq={turn.seq!} />
                </div>
                <WordLine text={turn.text} words={byseq.get(turn.seq!)?.words ?? []} />
                {items
                  .filter((it) => it.seq === turn.seq)
                  .map((it) => {
                    const upgrade = isUpgrade(it.severity);
                    const key = it.keyExpression;
                    return (
                      <div
                        key={it.id}
                        className={`mt-4 border-l-2 pl-4 text-sm ${upgrade ? "border-sky" : "border-accent"}`}
                      >
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <Badge tone={upgrade ? "sky" : "accent"}>{upgrade ? "より良い言い方" : "直したい点"}</Badge>
                          <span className="text-xs text-muted">{FEEDBACK_CATEGORY_LABEL[it.category]}</span>
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            {/* 言い換えの提案（誤りではない）は取り消し線にしない */}
                            <div className={upgrade ? "text-muted" : "text-muted line-through decoration-accent decoration-1"}>
                              {it.original}
                            </div>
                            <div className="mt-1 flex items-start gap-1.5 text-[15px] font-bold">
                              <ArrowRight size={15} className="mt-1 shrink-0 text-accent" />
                              {it.improved}
                            </div>
                          </div>
                          <SpeakButton text={it.improved} />
                        </div>
                        <p className="mt-2 leading-relaxed text-muted">{it.explanation}</p>
                        {key && (
                          <form
                            action={addFeedbackExpression.bind(null, { ...key, example: it.improved, scene: scenarioTitle })}
                            className="mt-3 flex items-center justify-between gap-3 border-t border-dashed border-line pt-3"
                          >
                            <div className="min-w-0 text-sm">
                              <span className="eyebrow mr-2">Keep</span>
                              <b>{key.text}</b>
                              <span className="text-muted"> — {key.meaning}</span>
                            </div>
                            {added.has(key.text) ? (
                              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-good">
                                <BookmarkCheck size={15} />
                                追加済み
                              </span>
                            ) : (
                              <button className="btn shrink-0 px-2.5 py-1.5 text-xs">
                                <BookmarkPlus size={14} />
                                追加
                              </button>
                            )}
                          </form>
                        )}
                      </div>
                    );
                  })}
              </div>
            ),
          )}
        </div>
      </section>

      {suggested.length > 0 && (
        <section className="mb-12">
          <SectionTitle aside={`${suggested.length} items`}>覚えておきたい表現</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {suggested.map((e) => (
              <ExpressionCard key={e.id} e={e} badge="提案" badgeTone="sun">
                <form action={expressionAction} className="flex gap-2 border-t border-line pt-3">
                  <input type="hidden" name="id" value={e.id} />
                  <button name="action" value="adopt" className="btn-ink flex-1 py-2 text-sm">
                    <Plus size={15} />
                    覚えるリストへ
                  </button>
                  <button name="action" value="delete" className="btn px-3" aria-label="この提案を消す">
                    <X size={15} />
                  </button>
                </form>
              </ExpressionCard>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <span className="font-mono text-xs text-muted">
          {Math.round(session.durationSec / 60)} min · ¥{yen}
        </span>
        <Link href="/" className="btn">
          ホームへ
        </Link>
      </div>
    </Page>
  );
}

/** 上段は文字起こし、下段は Azure が聞き取った語を発音スコアで色分けしたもの（語が1対1で対応しないため分けて表示） */
function WordLine({ text, words }: { text: string; words: WordAssessment[] }) {
  if (!words.length) return <p className="leading-relaxed">{text}</p>;
  const weak = words.filter(isWeakWord);
  return (
    <div>
      <p className="leading-relaxed font-medium">{text}</p>
      <p className="mt-2 flex flex-wrap gap-1 text-sm">
        {words.map((w, i) => (
          <span
            key={i}
            className={`rounded-sm px-0.5 ${scoreColor(w.accuracy)} ${w.accuracy < 65 ? "bg-bad-soft" : ""} ${
              w.prosodyErrors.length ? "underline decoration-dotted underline-offset-4" : ""
            }`}
          >
            {w.word}
          </span>
        ))}
      </p>
      {weak.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
          {weak.slice(0, 6).map((w, i) => (
            <li key={i} className="rounded border border-line px-2 py-1">
              <b className={scoreColor(w.accuracy)}>{w.word}</b>{" "}
              <span className="text-muted">
                {Math.round(w.accuracy)}点 {w.weakPhonemes.map(formatPhoneme).join(" ")} {w.prosodyErrors.join(" ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
