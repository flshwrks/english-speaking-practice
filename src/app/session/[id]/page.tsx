import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, t } from "@/db";
import type { WordAssessment } from "@/db/schema";
import { SpeakButton } from "@/components/speak-button";
import { Header, Page, scoreColor, Stat } from "@/components/ui";
import { EXPRESSION_KIND_LABEL, FEEDBACK_CATEGORY_LABEL } from "@/lib/categories";
import { usdToJpy } from "@/lib/config";
import { sessionTargets } from "@/lib/expressions";
import { formatPhoneme, isWeakWord, targetMark } from "@/lib/format";
import { getScenario } from "@/lib/scenarios";
import { addExpressionAction, expressionAction, retryAnalysis } from "../../actions";
import { AutoRefresh, MyRecording, PurgeOldAudio } from "./client";

// 再分析（retryAnalysis の after()）がこのページの実行時間内で動くため
export const maxDuration = 300;

export default async function SessionPage({ params }: PageProps<"/session/[id]">) {
  const id = Number((await params).id);
  const d = db();
  const [[session], items, utterances, targets, suggested] = await Promise.all([
    d.select().from(t.sessions).where(eq(t.sessions.id, id)),
    d.select().from(t.feedbackItems).where(eq(t.feedbackItems.sessionId, id)).orderBy(asc(t.feedbackItems.id)),
    d.select().from(t.utterances).where(eq(t.utterances.sessionId, id)),
    sessionTargets([id]),
    // 会話後 FB で提案され、まだ採用・却下していない表現
    d.select().from(t.expressions).where(eq(t.expressions.status, "suggested")).limit(8),
  ]);
  if (!session) notFound();
  const scenarioTitle = getScenario(session.scenarioId)?.title ?? "セッション";
  // 「覚える表現」のうち、すでに表現リストにある（提案中を除く）ものは「追加済み」と表示する
  const keyTexts = items.flatMap((it) => (it.keyExpression ? [it.keyExpression.text] : []));
  const added = new Set(
    keyTexts.length
      ? (
          await d
            .select({ text: t.expressions.text })
            .from(t.expressions)
            .where(and(inArray(t.expressions.text, keyTexts), ne(t.expressions.status, "suggested")))
        ).map((e) => e.text)
      : [],
  );
  const byseq = new Map(utterances.map((u) => [u.seq, u]));
  const m = session.metrics;
  const yen = Math.round(usdToJpy(session.costUsd));
  const usedCount = targets.filter((x) => x.used && x.correct).length;

  return (
    <Page>
      <PurgeOldAudio />
      <Header title={scenarioTitle} />

      {session.status === "analyzing" && (
        <div className="card mb-6 text-center">
          <AutoRefresh />
          <p className="font-medium">フィードバックを作成中です…</p>
          <p className="mt-1 text-sm text-muted">発音データと会話を分析しています（30秒〜1分ほど）</p>
        </div>
      )}
      {session.status === "error" && (
        <form action={retryAnalysis} className="card mb-6 flex items-center justify-between gap-3">
          <p className="text-sm text-bad">分析に失敗しました: {session.error}</p>
          <input type="hidden" name="id" value={id} />
          {session.turns.length > 0 && <button className="btn">再分析</button>}
        </form>
      )}

      {session.status === "done" && (
        <>
          <section className="card mb-4">
            <p>{session.summary}</p>
            {m && (
              <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
                <Stat label="推定レベル" value={m.estimatedCefr} />
                <Stat label="話速" value={m.wpm} sub="WPM" />
                <Stat label="発音" value={<span className={scoreColor(m.accuracy)}>{m.accuracy ?? "—"}</span>} />
                <Stat label="流暢さ" value={<span className={scoreColor(m.fluency)}>{m.fluency ?? "—"}</span>} />
                <Stat label="抑揚" value={<span className={scoreColor(m.prosody)}>{m.prosody ?? "—"}</span>} />
                <Stat label="誤り/100語" value={m.errorsPer100Words} />
              </div>
            )}
          </section>

          {session.topPoints && session.topPoints.length > 0 && (
            <section className="mb-6">
              <h2 className="label mb-2">今回の要点</h2>
              <ol className="flex flex-col gap-2">
                {session.topPoints.map((p, i) => (
                  <li key={i} className="card">
                    <div className="font-medium">
                      {i + 1}. {p.title}
                    </div>
                    <p className="mt-1 text-sm text-muted">{p.detail}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {targets.length > 0 && (
            <section className="mb-6">
              <h2 className="label mb-2">
                今日の表現: {usedCount}/{targets.length} 使えた
              </h2>
              <ul className="card flex flex-col gap-2 text-sm">
                {targets.map((x) => (
                  <li key={x.id}>
                    <span className="mr-2">{targetMark(x.used, x.correct)}</span>
                    <b>{x.text}</b>
                    {x.comment && <span className="text-muted"> — {x.comment}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <section className="mb-6">
        <h2 className="label mb-2">会話とフィードバック</h2>
        <div className="flex flex-col gap-3">
          {session.turns.map((turn, i) =>
            turn.role === "assistant" ? (
              <div key={i} className="max-w-[85%] self-start rounded-2xl bg-surface px-4 py-2 text-sm text-muted">
                {turn.text}
              </div>
            ) : (
              <div key={i} className="card border-accent/40">
                <div className="flex items-start justify-between gap-2">
                  <WordLine text={turn.text} words={byseq.get(turn.seq!)?.words ?? []} />
                  <MyRecording sessionId={id} seq={turn.seq!} />
                </div>
                {items
                  .filter((it) => it.seq === turn.seq)
                  .map((it) => (
                    <div key={it.id} className="mt-3 border-t border-line pt-3 text-sm">
                      <div className="mb-1 flex items-center gap-2 text-xs">
                        <span className="rounded bg-surface-2 px-1.5 py-0.5">{FEEDBACK_CATEGORY_LABEL[it.category]}</span>
                        {it.severity === 1 ? (
                          <span className="text-accent">より良い言い方</span>
                        ) : (
                          <span className="text-muted">{"●".repeat(it.severity)}</span>
                        )}
                      </div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          {/* 言い換えの提案（誤りではない）は取り消し線にしない */}
                          <div className={it.severity === 1 ? "text-muted" : "text-bad line-through decoration-1"}>
                            {it.original}
                          </div>
                          <div className="font-medium text-good">→ {it.improved}</div>
                        </div>
                        <SpeakButton text={it.improved} />
                      </div>
                      <p className="mt-1 text-muted">{it.explanation}</p>
                      {it.keyExpression && (
                        <form
                          action={addExpressionAction}
                          className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2"
                        >
                          <div>
                            <span className="mr-1 text-xs text-muted">覚える表現</span>
                            <b>{it.keyExpression.text}</b>
                            <span className="text-muted"> — {it.keyExpression.meaning}</span>
                          </div>
                          <input type="hidden" name="text" value={it.keyExpression.text} />
                          <input type="hidden" name="meaning" value={it.keyExpression.meaning} />
                          <input type="hidden" name="kind" value={it.keyExpression.kind} />
                          <input type="hidden" name="category" value={it.keyExpression.category} />
                          <input type="hidden" name="example" value={it.improved} />
                          <input type="hidden" name="scene" value={scenarioTitle} />
                          {added.has(it.keyExpression.text) ? (
                            <span className="shrink-0 text-xs text-muted">追加済み</span>
                          ) : (
                            <button className="btn shrink-0">＋追加</button>
                          )}
                        </form>
                      )}
                    </div>
                  ))}
              </div>
            ),
          )}
        </div>
      </section>

      {suggested.length > 0 && (
        <section className="mb-6">
          <h2 className="label mb-2">覚えておきたい表現（提案）</h2>
          <div className="grid gap-2">
            {suggested.map((e) => (
              <form key={e.id} action={expressionAction} className="card flex items-center justify-between gap-3">
                <div className="text-sm">
                  <span className="mr-1 text-xs text-muted">[{EXPRESSION_KIND_LABEL[e.kind]}]</span>
                  <b>{e.text}</b> <span className="text-muted">— {e.meaning}</span>
                  {e.example && <div className="italic">“{e.example}”</div>}
                </div>
                <input type="hidden" name="id" value={e.id} />
                <div className="flex shrink-0 gap-1">
                  <button name="action" value="adopt" className="btn">＋追加</button>
                  <button name="action" value="delete" className="btn" aria-label="却下">×</button>
                </div>
              </form>
            ))}
          </div>
        </section>
      )}

      <p className="text-right text-xs text-muted">
        {Math.round(session.durationSec / 60)}分 ・ 費用 約¥{yen}
      </p>
    </Page>
  );
}

/** 上段は文字起こし、下段は Azure が聞き取った語を発音スコアで色分けしたもの（語が1対1で対応しないため分けて表示） */
function WordLine({ text, words }: { text: string; words: WordAssessment[] }) {
  if (!words.length) return <p>{text}</p>;
  const weak = words.filter(isWeakWord);
  return (
    <div>
      <p>{text}</p>
      <p className="mt-1 flex flex-wrap gap-x-1.5 text-sm">
        {words.map((w, i) => (
          <span
            key={i}
            className={`${scoreColor(w.accuracy)} ${w.prosodyErrors.length ? "underline decoration-dotted" : ""}`}
          >
            {w.word}
          </span>
        ))}
      </p>
      {weak.length > 0 && (
        <ul className="mt-1 text-xs text-muted">
          {weak.slice(0, 6).map((w, i) => (
            <li key={i}>
              <b className={scoreColor(w.accuracy)}>{w.word}</b> {Math.round(w.accuracy)}点{" "}
              {w.weakPhonemes.map(formatPhoneme).join(" ")}{" "}
              {w.prosodyErrors.join(" ")}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
