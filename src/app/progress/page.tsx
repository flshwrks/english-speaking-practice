import { asc, count, desc, eq } from "drizzle-orm";
import { connection } from "next/server";
import { db, t } from "@/db";
import { LEARNING_STATUSES } from "@/db/schema";
import { TrendChart } from "@/components/trend-chart";
import { EmptyState, Header, Page, SectionTitle, Stat, StatRow } from "@/components/ui";
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

  return (
    <Page wide>
      <Header back={null} eyebrow="Progress" title="成長記録" subtitle="練習の積み重ねと、伸びている力" />

      <div className="mb-12">
        <StatRow cols={4}>
          <Stat label="Streak" value={practice.streak} sub="連続練習（日）" />
          <Stat label="Minutes" value={totalMin} sub={`累計・${sessions.length}セッション`} />
          <Stat label="CEFR" value={sessions.at(-1)?.metrics?.estimatedCefr ?? "—"} sub="最新の推定レベル" />
          <Stat
            label="Mastered"
            value={n("mastered")}
            sub={`習得した表現・練習中 ${LEARNING_STATUSES.reduce((sum, st) => sum + n(st), 0)}`}
          />
        </StatRow>
      </div>

      {/* 練習カレンダー */}
      <section className="mb-12">
        <SectionTitle index="01" aside="Last 12 weeks">
          練習カレンダー
        </SectionTitle>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <div className="grid shrink-0 grid-rows-7 gap-[3px] font-mono text-[10px] leading-none text-muted">
            {WEEKDAYS.map((w, i) => (
              <span key={i} className="flex h-4 items-center sm:h-5">
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
                      className={`size-4 rounded-[2px] sm:size-5 ${
                        day.count === 0 ? "bg-surface-2" : day.count === 1 ? "bg-fg/40" : "bg-fg"
                      } ${day.date === practice.today ? "outline-2 outline-offset-1 outline-accent" : ""}`}
                    />
                  ) : (
                    <span key={di} className="size-4 sm:size-5" />
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-end gap-1.5 font-mono text-[10px] text-muted">
          LESS
          <span className="size-3 rounded-[2px] bg-surface-2" />
          <span className="size-3 rounded-[2px] bg-fg/40" />
          <span className="size-3 rounded-[2px] bg-fg" />
          MORE
        </div>
      </section>

      <section className="mb-12">
        <SectionTitle index="02">スコアの推移</SectionTitle>
        <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          <TrendChart title="Accuracy · 発音の正確さ" points={series("accuracy")} />
          <TrendChart title="Fluency · 流暢さ" points={series("fluency")} />
          <TrendChart title="Prosody · 抑揚・リズム" points={series("prosody")} />
          <TrendChart title="Speed · 話速" unit="wpm" points={series("wpm")} />
          <TrendChart title="Errors · 100語あたり" points={series("errorsPer100Words")} higherIsBetter={false} />
        </div>
      </section>

      <section>
        <SectionTitle index="03">よくあるミスの型</SectionTitle>
        {patterns.length === 0 ? (
          <EmptyState title="まだ記録がありません">会話をすると、繰り返しがちなミスがここにまとまります</EmptyState>
        ) : (
          <ul className="border-t border-line">
            {patterns.map((p) => (
              <li key={p.key} className="border-b border-line py-3.5">
                <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-baseline gap-3">
                    <span className="eyebrow shrink-0">{FEEDBACK_CATEGORY_LABEL[p.category]}</span>
                    <span className="truncate font-bold">{p.label}</span>
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted tabular-nums">
                    <b className="text-fg">{p.count}×</b> · {formatDateJst(p.lastSeenAt)}
                  </span>
                </div>
                <div className="h-1 bg-surface-2">
                  <div className="h-full bg-fg" style={{ width: `${(p.count / maxPattern) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Page>
  );
}
