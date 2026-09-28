import { asc, count, eq } from "drizzle-orm";
import { ChevronRight } from "lucide-react";
import { connection } from "next/server";
import { db, t } from "@/db";
import { LEARNING_STATUSES } from "@/db/schema";
import { ScoreChart, TrendChart } from "@/components/trend-chart";
import { Badge, EmptyState, Page, PageTitle, Section, type Tone } from "@/components/ui";
import { FEEDBACK_CATEGORY_LABEL } from "@/lib/categories";
import { formatDateJst } from "@/lib/format";
import { loadWeaknesses } from "@/lib/lesson";
import { calendarWeeks, countByDay, summarizePractice } from "@/lib/stats";
import type { Weakness, WeaknessState } from "@/lib/weakness";

const WEEKDAYS = ["月", "", "水", "", "金", "", "日"];

export default async function ProgressPage() {
  await connection(); // 個人データを毎回 DB から読むため静的生成しない
  const d = db();
  const [sessions, weaknesses, statusCounts] = await Promise.all([
    d
      .select({ startedAt: t.sessions.startedAt, metrics: t.sessions.metrics, durationSec: t.sessions.durationSec })
      .from(t.sessions)
      .where(eq(t.sessions.status, "done"))
      .orderBy(asc(t.sessions.startedAt)),
    loadWeaknesses(),
    d.select({ status: t.expressions.status, n: count() }).from(t.expressions).groupBy(t.expressions.status),
  ]);
  // 練習日の集計は、読み込んだ完了セッションから求める（DB を二重に読まない）
  const practice = summarizePractice(countByDay(sessions.map((s) => s.startedAt)));

  const series = (key: "accuracy" | "fluency" | "prosody" | "wpm" | "errorsPer100Words") =>
    // 話速の 0 は「未計測」（語の時刻がない古い録音）なので線に含めない
    sessions.map((s) => {
      const v = s.metrics?.[key] ?? null;
      return { label: formatDateJst(s.startedAt), value: key === "wpm" && v === 0 ? null : v };
    });
  // 相手が話し終えてから話し始めるまで（秒）。記録が始まる前の会話は null
  const latency = sessions.map((s) => ({
    label: formatDateJst(s.startedAt),
    value: s.metrics?.medianLatencyMs == null ? null : s.metrics.medianLatencyMs / 1000,
  }));
  const hasLatency = latency.some((p) => p.value !== null);
  const n = (st: string) => statusCounts.find((c) => c.status === st)?.n ?? 0;
  const totalMin = Math.round(sessions.reduce((s, x) => s + x.durationSec, 0) / 60);
  const calendar = calendarWeeks(practice.byDay, practice.today);
  const open = weaknesses.filter((w) => w.state !== "resolved");
  const resolved = weaknesses.filter((w) => w.state === "resolved");

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
          <div className={`mt-6 grid gap-6 sm:grid-cols-2 ${hasLatency ? "xl:grid-cols-3" : ""}`}>
            <TrendChart title="話す速さ" unit="wpm" points={series("wpm")} />
            <TrendChart title="誤り（100語あたり）" points={series("errorsPer100Words")} higherIsBetter={false} />
            {hasLatency && <TrendChart title="話し始めるまで" unit="秒" points={latency} higherIsBetter={false} />}
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

      <Section title="よくあるミスの型" aside="優先度の高い順" className="mb-0">
        {weaknesses.length === 0 ? (
          <EmptyState title="まだ記録がありません">会話をすると、繰り返しがちなミスがここにまとまります</EmptyState>
        ) : (
          <>
            {open.length > 0 ? (
              <WeaknessList items={open} />
            ) : (
              <p className="meta border-y border-line py-4">いま気をつけたいミスの型はありません。</p>
            )}
            {resolved.length > 0 && (
              <details className="group mt-4">
                <summary className="meta inline-flex items-center gap-1 hover:text-fg">
                  <ChevronRight size={14} strokeWidth={1.75} className="transition-transform group-open:rotate-90" />
                  解決したミスの型 {resolved.length}
                </summary>
                <div className="mt-2">
                  <WeaknessList items={resolved} />
                </div>
              </details>
            )}
          </>
        )}
      </Section>
    </Page>
  );
}

/** 状態: 朱＝気をつけたい（要注意・再発）、黄土＝改善中、緑＝解決 */
const WEAKNESS_STATE: Record<WeaknessState, { label: string; tone: Tone }> = {
  active: { label: "要注意", tone: "accent" },
  reopened: { label: "再発", tone: "accent" },
  improving: { label: "改善中", tone: "warn" },
  resolved: { label: "解決", tone: "good" },
};

const lastSeen = (n: number) => (n === 0 ? "前回" : `${n + 1}回前`);

function WeaknessList({ items }: { items: Weakness[] }) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {items.map((w) => (
        <li key={w.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5 py-3">
          <span className="font-medium">{w.label}</span>
          <Badge tone={WEAKNESS_STATE[w.state].tone}>{WEAKNESS_STATE[w.state].label}</Badge>
          <span className="meta col-span-2 tabular-nums">
            {FEEDBACK_CATEGORY_LABEL[w.category]} · {w.count}回 · 最後は{lastSeen(w.sessionsSinceLast)}の会話
          </span>
        </li>
      ))}
    </ul>
  );
}
