import { count, desc, eq } from "drizzle-orm";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { after, connection } from "next/server";
import { db, t } from "@/db";
import type { SessionStatus } from "@/db/schema";
import { Badge, Section } from "@/components/ui";
import { pickTodaysExpressions, weakExpressionCategories } from "@/lib/expressions";
import { formatDateJst } from "@/lib/format";
import { budgetStatus, getCurrentCurriculum, isReviewDue } from "@/lib/lesson";
import { getScenario, scenarioMenu, type Scenario } from "@/lib/scenarios";
import { sweepStaleSessions } from "@/lib/session";
import { practiceSummary } from "@/lib/stats";

const STATUS_TEXT: Record<Exclude<SessionStatus, "done">, string> = {
  analyzing: "分析中",
  error: "エラー",
  active: "未完了",
};

export default async function Home() {
  await connection(); // 個人データを毎回 DB から読むため静的生成しない
  // タブを閉じたなどで終了の連絡がないまま時間を過ぎた会話を、表示の後で締めて分析に回す
  after(() => sweepStaleSessions());
  const [{ profile, curriculum }, budget, reviewDue, recent, [{ n: sessionCount }], practice, weakCategories] =
    await Promise.all([
      getCurrentCurriculum(),
      budgetStatus(),
      isReviewDue(),
      db()
        .select({
          id: t.sessions.id,
          scenarioId: t.sessions.scenarioId,
          status: t.sessions.status,
          startedAt: t.sessions.startedAt,
          metrics: t.sessions.metrics,
          topPoints: t.sessions.topPoints,
        })
        .from(t.sessions)
        .orderBy(desc(t.sessions.startedAt))
        .limit(5),
      db().select({ n: count() }).from(t.sessions).where(eq(t.sessions.status, "done")),
      practiceSummary(),
      weakExpressionCategories(),
    ]);

  // 今週のシナリオを、最近やったもの・苦手な表現のカテゴリで並べ替える
  const { scenarios, recommended } = scenarioMenu(sessionCount, curriculum.scenarioIds, {
    recentScenarioIds: recent.map((s) => s.scenarioId),
    weakCategories,
  });
  const pick = scenarios.find((s) => recommended.has(s.id)) ?? scenarios[0];
  // 準備画面と同じ選び方なので、ここで見せた表現がそのまま出題される
  const expressions = pick ? await pickTodaysExpressions(pick, curriculum) : [];
  const thisWeek = scenarios.filter((s) => recommended.has(s.id) && s.id !== pick?.id);
  const others = scenarios.filter((s) => !recommended.has(s.id));
  const budgetRatio = budget.spentJpy / budget.budgetJpy;
  // 初回（完了セッション0件）はレベル診断だけを勧め、何が起きるかを先に説明する
  const firstRun = sessionCount === 0;
  // 今日の宿題: 直近のフィードバックの要点の1つ目（会話の中で意識すること）
  const homework = recent.find((s) => s.status === "done" && s.topPoints?.length)?.topPoints?.[0]?.title;

  // 練習の状況と最近のセッション（PC は右の欄、スマホはシナリオ一覧の途中）
  const side = (
    <>
      {!firstRun && (
        <dl className="mb-8 flex flex-wrap gap-x-6 gap-y-1 lg:flex-col lg:gap-3">
          <Fact label="今週の練習" value={`${practice.thisWeek}回`} />
          <Fact label="連続" value={`${practice.streak}日`} />
          <Fact label="会話の難易度" value={`${profile.level} / 10`} />
        </dl>
      )}

      <h2 className="mb-1 text-[15px] font-bold">最近のセッション</h2>
      {recent.length === 0 ? (
        <p className="meta py-3">会話を終えると、ここからフィードバックを見返せます。</p>
      ) : (
        <ul>
          {recent.map((s) => (
            <li key={s.id} className="border-b border-line last:border-b-0">
              <Link href={`/session/${s.id}`} className="row-link group py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium group-hover:text-primary">
                    {getScenario(s.scenarioId)?.title ?? s.scenarioId}
                  </span>
                  <span className="meta shrink-0 tabular-nums">{formatDateJst(s.startedAt)}</span>
                </div>
                <div className="meta mt-0.5 flex items-center gap-2 tabular-nums">
                  {s.status === "done" && s.metrics ? (
                    <>
                      {s.metrics.estimatedCefr && <Badge tone="primary">{s.metrics.estimatedCefr}</Badge>}
                      <span>
                        発音 {score(s.metrics.accuracy)} · 流暢 {score(s.metrics.fluency)} · 抑揚{" "}
                        {score(s.metrics.prosody)}
                      </span>
                    </>
                  ) : (
                    <Badge tone={s.status === "error" ? "accent" : "neutral"}>
                      {STATUS_TEXT[s.status as Exclude<SessionStatus, "done">] ?? "—"}
                    </Badge>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  return (
    <main className="mx-auto w-full max-w-[1120px] px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:px-8 lg:px-10 lg:pt-10 lg:pb-16">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <Link href="/curriculum" className="meta mb-3 inline-flex items-center gap-0.5 hover:text-fg lg:hidden">
            第{curriculum.week}週 · {curriculum.theme}
            <ChevronRight size={14} strokeWidth={1.75} />
          </Link>

          {reviewDue && (
            <p className="mb-4 rounded-[10px] border border-warn/25 bg-warn-soft px-4 py-2.5 text-sm text-fg-2">
              週次レビューの時期です。Claude Code で <code className="font-medium text-fg">/weekly-review</code>{" "}
              を実行すると、今週の振り返りと来週の調整ができます。
            </p>
          )}

          {pick && (
            <section className="panel mb-10" aria-labelledby="today">
              <div className="rounded-t-[14px] bg-primary-soft/45 px-5 pt-5 pb-4 lg:px-7 lg:pt-6">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-bold text-primary">{firstRun ? "はじめの1回" : "今日のレッスン"}</p>
                  {practice.practicedToday && <Badge tone="good">今日は練習済み</Badge>}
                </div>
                <h1 id="today" className="mt-0.5 text-[22px] leading-snug font-bold lg:text-[26px]">
                  {pick.title}
                </h1>
                <p className="mt-1.5 max-w-[38em] text-fg-2">{pick.brief}</p>
                {homework && !firstRun && (
                  <p className="mt-3 max-w-[38em] text-sm">
                    <span className="mr-2 font-bold text-accent">今日の宿題</span>
                    {homework}
                  </p>
                )}
                {firstRun && (
                  <p className="mt-3 max-w-[38em] text-sm text-fg-2">
                    英語で15分ほど話すと、あなたに合った会話の難易度と、次から練習する表現が決まります。うまく話せなくても大丈夫です。
                  </p>
                )}
              </div>

              {expressions.length > 0 && (
                <ul className="border-t border-line px-5 lg:px-7">
                  {expressions.map((e) => (
                    <li
                      key={e.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 border-b border-line py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]"
                    >
                      <span className="font-bold">{e.text}</span>
                      <span className="meta order-3 col-span-2 -mt-0.5 sm:order-none sm:col-span-1 sm:mt-0 sm:text-[15px] sm:text-fg-2">
                        {e.meaning}
                      </span>
                      {e.role === "review" ? <Badge tone="accent">復習</Badge> : <span />}
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line px-5 py-4 lg:px-7">
                <Link href={`/session/new?scenario=${pick.id}`} className="btn-primary px-6 py-3 max-sm:w-full">
                  会話を始める
                  <ChevronRight size={18} strokeWidth={2} />
                </Link>
                <span className="meta">約15分 · イヤホン推奨</span>
                {budgetRatio > 0.8 && (
                  <span className="text-[13px] text-accent">
                    今月の予算の{Math.round(budgetRatio * 100)}%を使っています
                  </span>
                )}
              </div>
            </section>
          )}

          {thisWeek.length > 0 && (
            <Section title="今週のシナリオ">
              <ScenarioList items={thisWeek} />
            </Section>
          )}
          {!firstRun && <div className="mb-10 lg:hidden">{side}</div>}
          <Section title="ほかのシナリオ" className="mb-0">
            <ScenarioList items={others} />
          </Section>
        </div>

        <aside className="hidden min-w-0 lg:block">{side}</aside>
      </div>
    </main>
  );
}

const score = (v: number | null) => (v == null ? "—" : Math.round(v));

/** スマホは「今週の練習 3回」のように1行に並べ、PC は右の欄で縦に */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5 lg:justify-between">
      <dt className="meta">{label}</dt>
      <dd className="font-bold tabular-nums lg:text-[17px]">{value}</dd>
    </div>
  );
}

function ScenarioList({ items }: { items: Scenario[] }) {
  return (
    <ul className="grid border-t border-line sm:grid-cols-2 sm:gap-x-8">
      {items.map((s) => (
        <li key={s.id} className="border-b border-line">
          <Link href={`/session/new?scenario=${s.id}`} className="row-link group flex items-center gap-3 py-3.5">
            <span className="min-w-0 flex-1">
              <span className="block font-medium group-hover:text-primary">{s.title}</span>
              <span className="meta line-clamp-1">{s.brief}</span>
            </span>
            <ChevronRight
              size={18}
              strokeWidth={1.75}
              className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
