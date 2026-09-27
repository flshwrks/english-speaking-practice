import { asc, count, desc, eq } from "drizzle-orm";
import { connection } from "next/server";
import { db, t } from "@/db";
import { LEARNING_STATUSES } from "@/db/schema";
import { ScoreChart, TrendChart } from "@/components/trend-chart";
import { EmptyState, Page, PageTitle, Section } from "@/components/ui";
import { FEEDBACK_CATEGORY_LABEL } from "@/lib/categories";
import { formatDateJst } from "@/lib/format";
import { calendarWeeks, countByDay, summarizePractice } from "@/lib/stats";

const WEEKDAYS = ["月", "", "水", "", "金", "", "日"];

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
  // 練習日の集計は、読み込んだ完了セッションから求める（DB を二重に読まない）
  const practice = summarizePractice(countByDay(sessions.map((s) => s.startedAt)));

  const series = (key: "accuracy" | "fluency" | "prosody" | "wpm" | "errorsPer100Words") =>
    sessions.map((s) => ({ label: formatDateJst(s.startedAt), value: s.metrics?.[key] ?? null }));
  const n = (st: string) => statusCounts.find((c) => c.status === st)?.n ?? 0;
  const totalMin = Math.round(sessions.reduce((s, x) => s + x.durationSec, 0) / 60);
  const calendar = calendarWeeks(practice.byDay, practice.today);
  const maxPattern = Math.max(1, ...patterns.map((p) => p.count));

  const kpis = [
    { label: "連続", value: `${practice.streak}日` },
    { label: "累計", value: `${totalMin}分`, sub: `${sessions.length}回` },
    { label: "推定レベル", value: sessions.at(-1)?.metrics?.estimatedCefr || "—" },
    {
      label: "習得した表現",
      value: `${n("mastered")}`,
      sub: `練習中 ${LEARNING_STATUSES.reduce((sum, st) => sum + n(st), 0)}`,
    },
  ];

  return (
    <Page>
      <PageTitle>記録</PageTitle>

      <dl className="mb-10 grid grid-cols-2 gap-x-6 gap-y-4 sm:flex sm:flex-wrap sm:gap-x-10">
        {kpis.map((k) => (
          <div key={k.label}>
            <dt className="meta">{k.label}</dt>
            <dd className="tabular-nums">
              <span className="text-xl font-bold">{k.value}</span>
              {k.sub && <span className="meta ml-1.5">{k.sub}</span>}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mb-10 grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <h2 className="mb-3 text-[17px] font-bold">スコアの推移</h2>
          <div className="panel p-4 sm:p-5">
            <ScoreChart
              series={[
                { name: "発音", points: series("accuracy") },
                { name: "流暢さ", points: series("fluency") },
                { name: "抑揚", points: series("prosody") },
              ]}
            />
          </div>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <TrendChart title="話す速さ" unit="wpm" points={series("wpm")} />
            <TrendChart title="誤り（100語あたり）" points={series("errorsPer100Words")} higherIsBetter={false} />
          </div>
        </section>

        <section className="min-w-0">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[17px] font-bold">練習した日</h2>
            <span className="meta">直近12週</span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto">
            <div className="grid shrink-0 grid-rows-7 gap-[3px] text-[11px] leading-none text-muted">
              {WEEKDAYS.map((w, i) => (
                <span key={i} className="flex h-[14px] items-center">
                  {w}
                </span>
              ))}
            </div>
            <div className="flex gap-[3px]">
              {calendar.map((week, wi) => (
                <div key={wi} className="grid grid-rows-7 gap-[3px]">
                  {week.map((day, di) =>
                    day ? (
                      <span
                        key={di}
                        title={`${day.date}: ${day.count}回`}
                        className={`size-[14px] rounded-[3px] ${
                          day.count === 0 ? "bg-sunken" : day.count === 1 ? "bg-primary/45" : "bg-primary"
                        } ${day.date === practice.today ? "outline-2 outline-offset-1 outline-accent" : ""}`}
                      />
                    ) : (
                      <span key={di} className="size-[14px]" />
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
          <p className="meta mt-3">濃いほど回数が多い日。朱色の枠が今日です。</p>
        </section>
      </div>

      <Section title="よくあるミスの型" className="mb-0">
        {patterns.length === 0 ? (
          <EmptyState title="まだ記録がありません">会話をすると、繰り返しがちなミスがここにまとまります</EmptyState>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="meta border-b border-line">
              <tr>
                <th className="w-32 py-2 pr-4 font-normal max-sm:w-24">種類</th>
                <th className="py-2 pr-4 font-normal">パターン</th>
                <th className="w-28 py-2 pr-4 text-right font-normal max-sm:w-12">回数</th>
                <th className="w-16 py-2 text-right font-normal max-sm:hidden">最後</th>
              </tr>
            </thead>
            <tbody>
              {patterns.map((p) => (
                <tr key={p.key} className="border-b border-line">
                  <td className="py-3 pr-4 whitespace-nowrap text-fg-2">{FEEDBACK_CATEGORY_LABEL[p.category]}</td>
                  <td className="py-3 pr-4 font-medium">{p.label}</td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    <span className="inline-flex items-center justify-end gap-2">
                      {maxPattern >= 3 && (
                        <span className="h-1 bg-fg" style={{ width: `${(p.count / maxPattern) * 64}px` }} aria-hidden />
                      )}
                      {p.count}
                    </span>
                  </td>
                  <td className="meta py-3 text-right tabular-nums max-sm:hidden">{formatDateJst(p.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </Page>
  );
}
