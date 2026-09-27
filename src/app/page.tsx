import { count, desc, eq } from "drizzle-orm";
import {
  ArrowRight,
  BellRing,
  CalendarCheck2,
  ChevronRight,
  Flame,
  Gauge,
  MessageCircleMore,
  Mic,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { db, t } from "@/db";
import type { SessionStatus } from "@/db/schema";
import { Blobs, Mascot, ScenarioArt, SparkleIcon } from "@/components/illustrations";
import { Badge, EmptyState, Page, ProgressBar, ProgressRing, SectionTitle, Stat } from "@/components/ui";
import { formatDateJst } from "@/lib/format";
import { budgetStatus, getCurrentCurriculum, isReviewDue } from "@/lib/lesson";
import { getScenario, scenarioMenu } from "@/lib/scenarios";
import { greeting, practiceSummary } from "@/lib/stats";
import { SYLLABUS } from "@/lib/syllabus";

const STATUS_TEXT: Record<Exclude<SessionStatus, "done">, string> = {
  analyzing: "分析中",
  error: "エラー",
  active: "未完了",
};

export default async function Home() {
  await connection(); // 個人データを毎回 DB から読むため静的生成しない
  const [{ profile, curriculum }, budget, reviewDue, recent, [{ n: sessionCount }], practice] = await Promise.all([
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
      })
      .from(t.sessions)
      .orderBy(desc(t.sessions.startedAt))
      .limit(5),
    db().select({ n: count() }).from(t.sessions).where(eq(t.sessions.status, "done")),
    practiceSummary(),
  ]);

  const { scenarios, recommended } = scenarioMenu(sessionCount, curriculum.scenarioIds);
  const pick = scenarios.find((s) => recommended.has(s.id)) ?? scenarios[0];
  const budgetRatio = budget.spentJpy / budget.budgetJpy;
  const mood = practice.practicedToday ? "cheer" : "happy";

  return (
    <Page wide>
      {/* ヒーロー */}
      <section className="relative mb-5 overflow-hidden rounded-[28px] hero-gradient p-6 text-white shadow-[var(--shadow-lift)] sm:p-8">
        <Blobs className="pointer-events-none absolute inset-0 h-full w-full" />
        <div className="relative flex items-center gap-4">
          <div className="min-w-0 flex-1 animate-rise">
            <div className="mb-3 flex flex-wrap gap-2 pr-20 sm:pr-0">
              <span className="pill bg-white/20 text-white backdrop-blur">
                <Flame size={14} strokeWidth={2.6} />
                {practice.streak > 0 ? `${practice.streak}日連続` : "今日から連続記録を始めよう"}
              </span>
              <span className="pill bg-white/20 text-white backdrop-blur">
                Week {curriculum.week}/{SYLLABUS.length}・{curriculum.phase}
              </span>
            </div>
            <h1 className="pr-16 text-[22px] leading-snug font-extrabold sm:pr-0 sm:text-3xl">
              {greeting()}！
              <br />
              {practice.practicedToday ? "今日もよく話せました" : "今日も少し話してみよう"}
            </h1>
            <p className="mt-2 text-sm text-white/80">
              今週のテーマは<b className="text-white">「{curriculum.theme}」</b>
            </p>
            {pick && (
              <Link
                href={`/session/new?scenario=${pick.id}`}
                className="group mt-5 flex w-full items-center gap-3 rounded-full bg-white py-2 pr-5 pl-2 font-bold text-[#4436d6] sm:inline-flex sm:w-auto shadow-[0_10px_24px_-10px_rgba(0,0,0,0.45)] transition active:scale-[0.97]"
              >
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[#5b4cf0] text-white">
                  <Mic size={20} strokeWidth={2.5} />
                </span>
                <span className="min-w-0 flex-1 text-left leading-tight">
                  <span className="block text-[11px] font-bold text-[#6f6a7e]">今日のおすすめ</span>
                  <span className="block truncate">{pick.title}</span>
                </span>
                <ArrowRight size={18} className="shrink-0 transition group-hover:translate-x-0.5" />
              </Link>
            )}
          </div>
          <Mascot
            mood={mood}
            className="absolute -top-2 right-0 size-20 shrink-0 animate-float drop-shadow-xl sm:static sm:size-[132px]"
          />
        </div>
      </section>

      {reviewDue && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-sun/40 bg-sun-soft p-4 text-sm">
          <BellRing size={20} className="mt-0.5 shrink-0 text-warn" />
          <p>
            <b>週次レビューの時期です。</b> Claude Code で{" "}
            <code className="rounded-md bg-surface px-1.5 py-0.5 font-bold">/weekly-review</code>{" "}
            を実行すると、1週間の振り返りと来週の調整ができます（しなくてもカリキュラムは自動で進みます）。
          </p>
        </div>
      )}

      <div className="mb-8 grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        {/* 数字 */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3 lg:grid-cols-1">
          <Stat icon={CalendarCheck2} tone="mint" label="今週の練習" value={`${practice.thisWeek}回`} />
          <Stat icon={Gauge} tone="sky" label="会話の難易度" value={`${profile.level}/10`} />
          <Stat icon={MessageCircleMore} tone="coral" label="完了セッション" value={sessionCount} />
        </div>

        {/* 今週 */}
        <Link href="/curriculum" className="card card-hover flex items-center gap-5">
          <ProgressRing value={curriculum.week / SYLLABUS.length} size={88}>
            <div className="text-[10px] font-bold text-muted">WEEK</div>
            <div className="text-2xl leading-none font-extrabold text-accent">{curriculum.week}</div>
          </ProgressRing>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge>{curriculum.phase}</Badge>
              {curriculum.cycle > 1 && <Badge tone="sky">{curriculum.cycle}周目</Badge>}
              {curriculum.overrideId && <Badge tone="sun">調整あり</Badge>}
            </div>
            <div className="mt-1.5 text-lg font-extrabold">{curriculum.theme}</div>
            <p className="mt-1 line-clamp-2 text-xs text-muted italic">{curriculum.focus}</p>
          </div>
          <ChevronRight size={20} className="shrink-0 text-muted" />
        </Link>
      </div>

      {/* シナリオ */}
      <SectionTitle icon={MessageCircleMore}>シナリオを選ぶ</SectionTitle>
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {scenarios.map((s, i) => (
          <Link
            key={s.id}
            href={`/session/new?scenario=${s.id}`}
            className={`card card-hover group relative flex animate-rise flex-row items-center gap-4 p-4 sm:flex-col sm:items-stretch sm:gap-3 sm:p-5 ${
              recommended.has(s.id) ? "border-accent/50 ring-2 ring-accent/15" : ""
            }`}
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <div className="flex items-start justify-between gap-2">
              <ScenarioArt id={s.id} size={52} />
              {recommended.has(s.id) && (
                <span className="hidden sm:inline-flex">
                  <Badge>
                    <SparkleIcon size={12} color="currentColor" />
                    おすすめ
                  </Badge>
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 font-extrabold">
                {s.title}
                {recommended.has(s.id) && <SparkleIcon size={14} className="shrink-0 sm:hidden" color="var(--accent)" />}
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-muted">{s.brief}</p>
            </div>
            <ArrowRight
              size={18}
              className="absolute right-5 bottom-5 text-muted opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100"
            />
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* 最近のセッション */}
        <section>
          <SectionTitle icon={CalendarCheck2}>最近のセッション</SectionTitle>
          {recent.length === 0 ? (
            <EmptyState title="まだセッションがありません" mood="happy">
              上の「今日のおすすめ」から始めてみましょう
            </EmptyState>
          ) : (
            <ul className="card divide-y divide-line p-0">
              {recent.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/session/${s.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition first:rounded-t-[var(--radius-card)] last:rounded-b-[var(--radius-card)] hover:bg-surface-2"
                  >
                    <ScenarioArt id={s.scenarioId} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold">{getScenario(s.scenarioId)?.title ?? s.scenarioId}</div>
                      <div className="text-xs text-muted">{formatDateJst(s.startedAt)}</div>
                    </div>
                    {s.status === "done" ? (
                      <div className="flex items-center gap-1.5">
                        {s.metrics?.estimatedCefr && <Badge tone="mint">{s.metrics.estimatedCefr}</Badge>}
                        <span className="hidden text-xs font-bold text-muted tabular-nums min-[420px]:inline">
                          {s.metrics?.wpm ?? 0} WPM
                        </span>
                      </div>
                    ) : (
                      <Badge tone={s.status === "error" ? "coral" : "sun"}>{STATUS_TEXT[s.status]}</Badge>
                    )}
                    <ChevronRight size={18} className="shrink-0 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 費用 */}
        <section>
          <SectionTitle icon={Wallet}>今月のAPI費用</SectionTitle>
          <div className="card">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-2xl font-extrabold tabular-nums">¥{Math.round(budget.spentJpy).toLocaleString()}</span>
              <span className="text-sm text-muted tabular-nums">/ ¥{budget.budgetJpy.toLocaleString()}</span>
            </div>
            <ProgressBar value={budgetRatio} tone={budget.exceeded ? "coral" : budgetRatio > 0.8 ? "sun" : "mint"} />
            <p className="mt-2 text-xs text-muted">
              {budget.exceeded
                ? "今月の予算に達しました。"
                : `残り約¥${Math.max(0, Math.round(budget.budgetJpy - budget.spentJpy)).toLocaleString()}`}
            </p>
          </div>
        </section>
      </div>
    </Page>
  );
}
