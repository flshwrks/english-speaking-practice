import { connection } from "next/server";
import { count, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { db, t } from "@/db";
import { Badge, Page } from "@/components/ui";
import { budgetStatus, getCurrentCurriculum, isReviewDue } from "@/lib/lesson";
import type { SessionStatus } from "@/db/schema";
import { formatDateJst } from "@/lib/format";
import { getScenario, scenarioMenu } from "@/lib/scenarios";
import { SYLLABUS } from "@/lib/syllabus";

const STATUS_TEXT: Record<Exclude<SessionStatus, "done">, string> = {
  analyzing: "分析中",
  error: "エラー",
  active: "未完了",
};

export default async function Home() {
  await connection(); // 個人データを毎回 DB から読むため静的生成しない
  const [{ profile, curriculum }, budget, reviewDue, recent, [{ n: sessionCount }]] = await Promise.all([
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
  ]);

  const { scenarios, recommended } = scenarioMenu(sessionCount, curriculum.scenarioIds);
  const pct = Math.min(100, (budget.spentJpy / budget.budgetJpy) * 100);

  return (
    <Page>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Speaking Practice</h1>
        <nav className="flex gap-2">
          <Link href="/curriculum" className="btn">カリキュラム</Link>
          <Link href="/expressions" className="btn">表現</Link>
          <Link href="/progress" className="btn">成長記録</Link>
          <Link href="/profile" className="btn">プロフィール</Link>
        </nav>
      </div>

      {reviewDue && (
        <div className="mb-4 rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm">
          <b>週次レビューの時期です。</b> Claude Code で <code className="rounded bg-surface-2 px-1">/weekly-review</code>{" "}
          を実行すると、1週間の振り返りと来週の調整ができます（しなくてもカリキュラムは自動で進みます）。
        </div>
      )}

      <section className="card mb-4">
        <div className="label">
          Week {curriculum.week}/{SYLLABUS.length}・{curriculum.phase}
          {curriculum.cycle > 1 && `・${curriculum.cycle}周目`}
          {curriculum.overrideId && "・今週は調整あり"}
        </div>
        <div className="mt-1 text-lg font-semibold">{curriculum.theme}</div>
        <p className="mt-1 text-sm text-muted">{curriculum.focus}</p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
          <span>会話の難易度: <b className="text-fg">{profile.level}</b>/10</span>
          <span>完了セッション: <b className="text-fg">{sessionCount}</b></span>
        </div>
      </section>

      <section className="mb-6">
        <div className="mb-1 flex justify-between text-xs text-muted">
          <span>今月のAPI費用</span>
          <span className="tabular-nums">
            ¥{Math.round(budget.spentJpy).toLocaleString()} / ¥{budget.budgetJpy.toLocaleString()}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className={`h-full ${budget.exceeded ? "bg-bad" : pct > 80 ? "bg-warn" : "bg-accent"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </section>

      <h2 className="label mb-2">シナリオを選ぶ</h2>
      <div className="mb-8 grid gap-3 sm:grid-cols-2">
        {scenarios.map((s) => (
          <Link
            key={s.id}
            href={`/session/new?scenario=${s.id}`}
            className={`card transition hover:border-accent ${
              recommended.has(s.id) ? "border-accent" : ""
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              {s.title}
              {recommended.has(s.id) && (
                <Badge>おすすめ</Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted">{s.brief}</p>
          </Link>
        ))}
      </div>

      {recent.length > 0 && (
        <>
          <h2 className="label mb-2">最近のセッション</h2>
          <ul className="card divide-y divide-line p-0">
            {recent.map((s) => (
              <li key={s.id}>
                <Link href={`/session/${s.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-surface-2">
                  <span>
                    {formatDateJst(s.startedAt)}{" "}
                    {getScenario(s.scenarioId)?.title ?? s.scenarioId}
                  </span>
                  <span className="text-muted">
                    {s.status === "done" ? `${s.metrics?.estimatedCefr ?? ""} ・ ${s.metrics?.wpm ?? 0} WPM` : STATUS_TEXT[s.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Page>
  );
}
