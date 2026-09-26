import { connection } from "next/server";
import { asc, count, desc, eq } from "drizzle-orm";
import { db, t } from "@/db";
import { TrendChart } from "@/components/trend-chart";
import { Header, Page, Stat } from "@/components/ui";
import { LEARNING_STATUSES } from "@/db/schema";
import { FEEDBACK_CATEGORY_LABEL } from "@/lib/categories";
import { formatDateJst } from "@/lib/format";

export default async function ProgressPage() {
  await connection(); // 個人データを毎回 DB から読むため静的生成しない
  const d = db();
  const [sessions, patterns, statusCounts] = await Promise.all([
    d
      .select({ startedAt: t.sessions.startedAt, metrics: t.sessions.metrics, durationSec: t.sessions.durationSec })
      .from(t.sessions)
      .where(eq(t.sessions.status, "done"))
      .orderBy(asc(t.sessions.startedAt)),
    d.select().from(t.errorPatterns).orderBy(desc(t.errorPatterns.count)).limit(12),
    d.select({ status: t.expressions.status, n: count() }).from(t.expressions).groupBy(t.expressions.status),
  ]);

  const series = (key: "accuracy" | "fluency" | "prosody" | "wpm" | "errorsPer100Words") =>
    sessions.map((s) => ({ label: formatDateJst(s.startedAt), value: s.metrics?.[key] ?? null }));
  const n = (st: string) => statusCounts.find((c) => c.status === st)?.n ?? 0;
  const totalMin = Math.round(sessions.reduce((s, x) => s + x.durationSec, 0) / 60);

  return (
    <Page>
      <Header title="成長記録" />

      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="完了セッション" value={sessions.length} />
        <Stat label="累計練習時間" value={`${totalMin}分`} />
        <Stat label="最新の推定レベル" value={sessions.at(-1)?.metrics?.estimatedCefr ?? "—"} />
        <Stat label="習得した表現" value={n("mastered")} sub={`練習中 ${LEARNING_STATUSES.reduce((sum, st) => sum + n(st), 0)}`} />
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-2">
        <TrendChart title="発音の正確さ" points={series("accuracy")} />
        <TrendChart title="流暢さ" points={series("fluency")} />
        <TrendChart title="抑揚・リズム" points={series("prosody")} />
        <TrendChart title="話速" unit=" WPM" points={series("wpm")} />
        <TrendChart title="誤り（100語あたり）" points={series("errorsPer100Words")} higherIsBetter={false} />
      </div>

      <h2 className="label mb-2">よくあるミスの型</h2>
      {patterns.length === 0 ? (
        <p className="text-sm text-muted">まだ記録がありません。</p>
      ) : (
        <ul className="card divide-y divide-line p-0">
          {patterns.map((p) => (
            <li key={p.key} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
              <span>
                <span className="mr-2 rounded bg-surface-2 px-1.5 py-0.5 text-xs">{FEEDBACK_CATEGORY_LABEL[p.category]}</span>
                {p.label}
              </span>
              <span className="shrink-0 text-muted tabular-nums">
                {p.count}回 ・ 最終 {formatDateJst(p.lastSeenAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
