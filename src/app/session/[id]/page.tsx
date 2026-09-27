import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import {
  ArrowRight,
  BookmarkCheck,
  BookmarkPlus,
  CheckCircle2,
  Circle,
  CircleAlert,
  Clock,
  Lightbulb,
  MessagesSquare,
  Plus,
  RotateCcw,
  Sparkles,
  Target,
  Wallet,
  Wand2,
  X,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, t } from "@/db";
import type { WordAssessment } from "@/db/schema";
import { ExpressionCard } from "@/components/expression-card";
import { Confetti, Mascot, ScenarioArt } from "@/components/illustrations";
import { SpeakButton } from "@/components/speak-button";
import { Badge, Header, Page, ProgressRing, ScoreRing, scoreColor, SectionTitle } from "@/components/ui";
import { FEEDBACK_CATEGORY_LABEL, isUpgrade } from "@/lib/categories";
import { usdToJpy } from "@/lib/config";
import { sessionTargets } from "@/lib/expressions";
import { formatDateJst, formatPhoneme, isWeakWord } from "@/lib/format";
import { getScenario } from "@/lib/scenarios";
import { addFeedbackExpression, expressionAction, retryAnalysis } from "../../actions";
import { AnalyzingSteps, AutoRefresh, MyRecording, PurgeOldAudio } from "./client";

// 再分析（retryAnalysis の after()）がこのページの実行時間内で動くため
export const maxDuration = 300;

const POINT_TONES = ["bg-coral text-white", "bg-sun text-[#3a2a00]", "bg-sky text-white"];

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
      <Header title={scenarioTitle} subtitle={`${formatDateJst(session.startedAt, "full")} のフィードバック`} />

      {session.status === "analyzing" && (
        <section className="card mb-6 flex flex-col items-center py-10 text-center">
          <AutoRefresh />
          <Mascot mood="think" size={120} className="animate-float" />
          <p className="mt-3 text-lg font-extrabold">フィードバックを作成中です</p>
          <p className="mt-1 text-sm text-muted">発音データと会話を分析しています（30秒〜1分ほど）</p>
          <AnalyzingSteps />
        </section>
      )}

      {session.status === "error" && (
        <form action={retryAnalysis} className="card mb-6 flex flex-col items-center gap-3 py-8 text-center">
          <Mascot mood="sleepy" size={96} />
          <p className="font-extrabold">分析に失敗しました</p>
          <p className="max-w-md text-sm text-muted">{session.error}</p>
          <input type="hidden" name="id" value={id} />
          {session.turns.length > 0 && (
            <button className="btn-primary">
              <RotateCcw size={16} strokeWidth={2.6} />
              もう一度分析する
            </button>
          )}
        </form>
      )}

      {session.status === "done" && (
        <>
          {/* 結果のヒーロー */}
          <section className="card relative mb-5 overflow-hidden border-accent/20 bg-gradient-to-br from-accent-soft via-surface to-surface">
            <Confetti className="pointer-events-none absolute -top-1 right-0 left-0 h-14 w-full opacity-80" />
            <div className="relative flex items-center gap-4 pt-4">
              <Mascot mood="cheer" size={96} className="shrink-0 animate-float" />
              <div className="min-w-0">
                <div className="text-xl font-extrabold">おつかれさまでした！</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {m?.estimatedCefr && <Badge tone="accent">推定 {m.estimatedCefr}</Badge>}
                  {m && <Badge tone="sky">{m.wpm} WPM</Badge>}
                  {m && <Badge tone="coral">誤り {m.errorsPer100Words}/100語</Badge>}
                </div>
              </div>
            </div>
            <p className="relative mt-4 leading-relaxed">{session.summary}</p>
            {m && (
              <div className="relative mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-surface/70 py-4">
                <ScoreRing label="発音" value={m.accuracy} size={80} />
                <ScoreRing label="流暢さ" value={m.fluency} size={80} />
                <ScoreRing label="抑揚" value={m.prosody} size={80} />
              </div>
            )}
          </section>

          {session.topPoints && session.topPoints.length > 0 && (
            <section className="mb-6">
              <SectionTitle icon={Lightbulb}>今回の要点</SectionTitle>
              <ol className="flex flex-col gap-3">
                {session.topPoints.map((p, i) => (
                  <li key={i} className="card flex animate-rise gap-4" style={{ animationDelay: `${i * 70}ms` }}>
                    <span
                      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-2xl text-base font-extrabold ${POINT_TONES[i % 3]}`}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="font-extrabold">{p.title}</div>
                      <p className="mt-1 text-sm leading-relaxed text-muted">{p.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {targets.length > 0 && (
            <section className="mb-6">
              <SectionTitle icon={Target}>今日の表現</SectionTitle>
              <div className="card flex flex-col gap-4 sm:flex-row sm:items-start">
                <ProgressRing value={usedCount / targets.length} size={84} color="var(--mint)" track="var(--mint-soft)">
                  <div className="text-xl leading-none font-extrabold">
                    {usedCount}
                    <span className="text-sm text-muted">/{targets.length}</span>
                  </div>
                  <div className="text-[10px] font-bold text-muted">使えた</div>
                </ProgressRing>
                <ul className="flex flex-1 flex-col gap-2.5">
                  {targets.map((x) => (
                    <li key={x.id} className="flex gap-2.5">
                      {x.used ? (
                        x.correct ? (
                          <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-mint" />
                        ) : (
                          <CircleAlert size={20} className="mt-0.5 shrink-0 text-warn" />
                        )
                      ) : (
                        <Circle size={20} className="mt-0.5 shrink-0 text-line" />
                      )}
                      <div className="min-w-0 text-sm">
                        <b>{x.text}</b>
                        {x.comment && <p className="text-muted">{x.comment}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </>
      )}

      <section className="mb-6">
        <SectionTitle icon={MessagesSquare}>会話とフィードバック</SectionTitle>
        <div className="flex flex-col gap-3">
          {session.turns.map((turn, i) =>
            turn.role === "assistant" ? (
              <div key={i} className="flex items-end gap-2 self-start pr-8">
                <ScenarioArt id={session.scenarioId} size={28} />
                <div className="rounded-3xl rounded-bl-md border border-line bg-surface px-4 py-2 text-sm text-muted">
                  {turn.text}
                </div>
              </div>
            ) : (
              <div key={i} className="card border-accent/25 p-4 sm:p-5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-accent">あなた</span>
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
                        className={`mt-3 rounded-2xl border-l-4 bg-surface-2/70 p-3.5 text-sm ${upgrade ? "border-mint" : "border-coral"}`}
                      >
                        <div className="mb-2 flex flex-wrap items-center gap-1.5">
                          {upgrade ? (
                            <Badge tone="mint">
                              <Wand2 size={12} strokeWidth={2.6} />
                              より良い言い方
                            </Badge>
                          ) : (
                            <Badge tone="coral">
                              <CircleAlert size={12} strokeWidth={2.6} />
                              直したい点
                            </Badge>
                          )}
                          <span className="text-xs font-bold text-muted">{FEEDBACK_CATEGORY_LABEL[it.category]}</span>
                        </div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            {/* 言い換えの提案（誤りではない）は取り消し線にしない */}
                            <div className={upgrade ? "text-muted" : "text-bad line-through decoration-1"}>{it.original}</div>
                            <div className="mt-0.5 flex items-start gap-1.5 font-bold text-good">
                              <ArrowRight size={15} className="mt-0.5 shrink-0" strokeWidth={2.6} />
                              {it.improved}
                            </div>
                          </div>
                          <SpeakButton text={it.improved} />
                        </div>
                        <p className="mt-2 leading-relaxed text-muted">{it.explanation}</p>
                        {key && (
                          <form
                            action={addFeedbackExpression.bind(null, { ...key, example: it.improved, scene: scenarioTitle })}
                            className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2 shadow-[var(--shadow-soft)]"
                          >
                            <div className="min-w-0 text-sm">
                              <span className="mr-1.5 text-[11px] font-bold text-muted">覚える表現</span>
                              <b>{key.text}</b>
                              <span className="text-muted"> — {key.meaning}</span>
                            </div>
                            {added.has(key.text) ? (
                              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-mint">
                                <BookmarkCheck size={15} />
                                追加済み
                              </span>
                            ) : (
                              <button className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-accent-fg transition active:scale-95">
                                <BookmarkPlus size={14} strokeWidth={2.6} />
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
        <section className="mb-6">
          <SectionTitle icon={Sparkles}>覚えておきたい表現</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {suggested.map((e) => (
              <ExpressionCard key={e.id} e={e} badge="提案" badgeTone="sun">
                <form action={expressionAction} className="flex gap-2 border-t border-line pt-3">
                  <input type="hidden" name="id" value={e.id} />
                  <button name="action" value="adopt" className="btn-primary flex-1 py-2 text-sm">
                    <Plus size={15} strokeWidth={2.8} />
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

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
        <span className="inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <Clock size={13} />
            {Math.round(session.durationSec / 60)}分
          </span>
          <span className="inline-flex items-center gap-1">
            <Wallet size={13} />約¥{yen}
          </span>
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
            className={`rounded-md px-1 ${scoreColor(w.accuracy)} ${w.accuracy < 65 ? "bg-bad-soft" : ""} ${
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
            <li key={i} className="rounded-full border border-line bg-surface px-2.5 py-1">
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
