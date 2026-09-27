import { count, desc, eq } from "drizzle-orm";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { db, t } from "@/db";
import type { SessionStatus } from "@/db/schema";
import { ScenarioArt } from "@/components/illustrations";
import { Badge, EmptyState, Page, ProgressBar, SectionTitle, Stat, StatRow } from "@/components/ui";
import { formatDateJst } from "@/lib/format";
import { budgetStatus, getCurrentCurriculum, isReviewDue } from "@/lib/lesson";
import { getScenario, scenarioMenu } from "@/lib/scenarios";
import { greeting, practiceSummary, todayLabel } from "@/lib/stats";
import { SYLLABUS } from "@/lib/syllabus";

const STATUS_TEXT: Record<Exclude<SessionStatus, "done">, string> = {
  analyzing: "分析中",
  error: "エラー",
  active: "未完了",
};

const pad2 = (n: number) => String(n).padStart(2, "0");

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

  return (
    <Page wide>
      {/* 冒頭 */}
      <section className="mb-10 animate-rise">
        <div className="eyebrow mb-5 flex flex-wrap gap-x-3 gap-y-1">
          <span>{todayLabel()}</span>
          <span className="text-line-strong">/</span>
          <span>
            Week {pad2(curriculum.week)} of {SYLLABUS.length}
          </span>
          <span className="text-line-strong">/</span>
          <span>{curriculum.phase}</span>
        </div>
        <h1 className="font-serif text-[56px] leading-[0.95] tracking-tight sm:text-[88px]">{greeting()}</h1>
        <p className="mt-4 max-w-xl text-lg font-bold sm:text-xl">
          {practice.practicedToday ? "今日の練習は完了。いい流れです。" : "今日も、少しだけ話してみましょう。"}
        </p>
        {pick && (
          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link href={`/session/new?scenario=${pick.id}`} className="btn-primary py-3 pr-4 pl-5 text-[15px]">
              {pick.title}を始める
              <ArrowRight size={17} strokeWidth={2.2} />
            </Link>
            <span className="text-sm text-muted">今日のおすすめ・約15分</span>
          </div>
        )}
      </section>

      {reviewDue && (
        <div className="mb-10 border-l-2 border-accent bg-surface py-3 pr-4 pl-4 text-sm">
          <b>週次レビューの時期です。</b> Claude Code で <code className="font-mono text-[13px]">/weekly-review</code>{" "}
          を実行すると、1週間の振り返りと来週の調整ができます。しなくてもカリキュラムは自動で進みます。
        </div>
      )}

      <div className="mb-12">
        <StatRow>
          <Stat label="This week" value={practice.thisWeek} sub="今週の練習（回）" />
          <Stat label="Streak" value={practice.streak} sub="連続練習（日）" />
          <Stat label="Level" value={profile.level} sub="会話の難易度（/10）" />
        </StatRow>
      </div>

      {/* 今週のテーマ */}
      <section className="mb-12">
        <SectionTitle index="01" aside={<Link href="/curriculum" className="inline-flex items-center gap-1 hover:text-fg">カリキュラム<ArrowUpRight size={13} /></Link>}>
          今週のテーマ
        </SectionTitle>
        <div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="sky">{curriculum.phase}</Badge>
              {curriculum.cycle > 1 && <Badge tone="mint">{curriculum.cycle}周目</Badge>}
              {curriculum.overrideId && <Badge tone="sun">調整あり</Badge>}
            </div>
            <p className="mt-3 text-2xl font-bold tracking-tight">{curriculum.theme}</p>
            <p className="mt-2 max-w-2xl font-serif text-lg leading-snug text-muted italic">“{curriculum.focus}”</p>
          </div>
          <div className="numeral text-6xl text-muted">
            <span className="text-fg">{pad2(curriculum.week)}</span>
            <span className="text-3xl">/{SYLLABUS.length}</span>
          </div>
        </div>
      </section>

      {/* シナリオ */}
      <section className="mb-12">
        <SectionTitle index="02" aside={`${scenarios.length} scenarios`}>
          シナリオを選ぶ
        </SectionTitle>
        <ol className="grid border-t border-line sm:grid-cols-2 sm:gap-x-10">
          {scenarios.map((s, i) => (
            <li key={s.id} className="border-b border-line">
              <Link href={`/session/new?scenario=${s.id}`} className="group flex items-center gap-4 py-4">
                <span className="w-6 font-mono text-xs text-muted">{pad2(i + 1)}</span>
                <ScenarioArt id={s.id} size={40} active={recommended.has(s.id)} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-bold">
                    <span className="truncate">{s.title}</span>
                    {recommended.has(s.id) && <Badge>おすすめ</Badge>}
                  </span>
                  <span className="mt-0.5 line-clamp-1 text-sm text-muted">{s.brief}</span>
                </span>
                <ArrowRight
                  size={16}
                  className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
                />
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-12 lg:grid-cols-[1.5fr_1fr]">
        {/* 最近のセッション */}
        <section>
          <SectionTitle index="03">最近のセッション</SectionTitle>
          {recent.length === 0 ? (
            <EmptyState title="まだセッションがありません">上の「始める」から最初の会話をしてみましょう</EmptyState>
          ) : (
            <ul className="border-t border-line">
              {recent.map((s) => (
                <li key={s.id} className="border-b border-line">
                  <Link href={`/session/${s.id}`} className="group flex items-center gap-4 py-3.5">
                    <span className="w-10 font-mono text-xs text-muted">{formatDateJst(s.startedAt)}</span>
                    <span className="min-w-0 flex-1 truncate font-bold">{getScenario(s.scenarioId)?.title ?? s.scenarioId}</span>
                    {s.status === "done" ? (
                      <span className="flex items-center gap-3 font-mono text-xs text-muted tabular-nums">
                        {s.metrics?.estimatedCefr && <Badge tone="mint">{s.metrics.estimatedCefr}</Badge>}
                        <span className="hidden sm:inline">{s.metrics?.wpm ?? 0} wpm</span>
                      </span>
                    ) : (
                      <Badge tone={s.status === "error" ? "coral" : "sun"}>{STATUS_TEXT[s.status]}</Badge>
                    )}
                    <ArrowRight size={15} className="shrink-0 text-muted group-hover:text-accent" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 費用 */}
        <section>
          <SectionTitle index="04">今月のAPI費用</SectionTitle>
          <div className="flex items-baseline justify-between gap-3">
            <span className="numeral text-5xl">¥{Math.round(budget.spentJpy).toLocaleString()}</span>
            <span className="font-mono text-xs text-muted">/ ¥{budget.budgetJpy.toLocaleString()}</span>
          </div>
          <div className="mt-4">
            <ProgressBar value={budgetRatio} tone={budget.exceeded ? "coral" : budgetRatio > 0.8 ? "sun" : "mint"} />
          </div>
          <p className="mt-2 text-xs text-muted">
            {budget.exceeded
              ? "今月の予算に達しました。"
              : `残り約¥${Math.max(0, Math.round(budget.budgetJpy - budget.spentJpy)).toLocaleString()}`}
          </p>
        </section>
      </div>
    </Page>
  );
}
