import { asc, count, desc, eq } from "drizzle-orm";
import {
  AudioLines,
  BookOpenCheck,
  CalendarDays,
  Clock3,
  Flame,
  Gauge,
  GraduationCap,
  MessageCircleWarning,
  Mic2,
  SpellCheck,
  TrendingUp,
  Waves,
} from "lucide-react";
import { connection } from "next/server";
import { db, t } from "@/db";
import { LEARNING_STATUSES } from "@/db/schema";
import { TrendChart } from "@/components/trend-chart";
import { Badge, EmptyState, Header, Page, SectionTitle, Stat } from "@/components/ui";
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
      <Header title="成長記録" subtitle="練習の積み重ねと、伸びている力" />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Flame} tone="coral" label="連続練習" value={`${practice.streak}日`} />
        <Stat icon={Clock3} tone="sky" label="累計練習時間" value={`${totalMin}分`} sub={`${sessions.length}セッション`} />
        <Stat icon={GraduationCap} tone="accent" label="最新の推定レベル" value={sessions.at(-1)?.metrics?.estimatedCefr ?? "—"} />
        <Stat
          icon={BookOpenCheck}
          tone="mint"
          label="習得した表現"
          value={n("mastered")}
          sub={`練習中 ${LEARNING_STATUSES.reduce((sum, st) => sum + n(st), 0)}`}
        />
      </div>

      {/* 練習カレンダー */}
      <section className="card mb-8">
        <SectionTitle icon={CalendarDays} aside={<span className="text-xs text-muted">直近12週</span>}>
          練習カレンダー
        </SectionTitle>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <div className="grid shrink-0 grid-rows-7 gap-1 pt-0.5 text-[10px] leading-none text-muted">
            {WEEKDAYS.map((w, i) => (
              <span key={i} className="flex h-4 items-center sm:h-5">
                {w}
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            {calendar.map((week, wi) => (
              <div key={wi} className="grid grid-rows-7 gap-1">
                {week.map((day, di) =>
                  day ? (
                    <span
                      key={di}
                      title={`${day.date}: ${day.count}回`}
                      className={`size-4 rounded-[5px] sm:size-5 ${
                        day.count === 0
                          ? "bg-surface-2"
                          : day.count === 1
                            ? "bg-accent/45"
                            : "bg-accent"
                      } ${day.date === practice.today ? "ring-2 ring-coral ring-offset-1 ring-offset-surface" : ""}`}
                    />
                  ) : (
                    <span key={di} className="size-4 sm:size-5" />
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-muted">
          少ない
          <span className="size-3 rounded-[4px] bg-surface-2" />
          <span className="size-3 rounded-[4px] bg-accent/45" />
          <span className="size-3 rounded-[4px] bg-accent" />
          多い
        </div>
      </section>

      <SectionTitle icon={TrendingUp}>スコアの推移</SectionTitle>
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <TrendChart title="発音の正確さ" icon={Mic2} color="var(--accent)" points={series("accuracy")} />
        <TrendChart title="流暢さ" icon={Waves} color="var(--sky)" points={series("fluency")} />
        <TrendChart title="抑揚・リズム" icon={AudioLines} color="var(--mint)" points={series("prosody")} />
        <TrendChart title="話速" icon={Gauge} unit=" WPM" color="var(--sun)" points={series("wpm")} />
        <TrendChart
          title="誤り（100語あたり）"
          icon={SpellCheck}
          color="var(--coral)"
          points={series("errorsPer100Words")}
          higherIsBetter={false}
        />
      </div>

      <SectionTitle icon={MessageCircleWarning}>よくあるミスの型</SectionTitle>
      {patterns.length === 0 ? (
        <EmptyState title="まだ記録がありません" mood="happy">
          会話をすると、繰り返しがちなミスがここにまとまります
        </EmptyState>
      ) : (
        <ul className="card flex flex-col gap-4">
          {patterns.map((p) => (
            <li key={p.key}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <Badge tone="coral">{FEEDBACK_CATEGORY_LABEL[p.category]}</Badge>
                  <span className="truncate font-bold">{p.label}</span>
                </span>
                <span className="shrink-0 text-xs text-muted tabular-nums">
                  <b className="text-fg">{p.count}</b>回・{formatDateJst(p.lastSeenAt)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-coral to-sun"
                  style={{ width: `${(p.count / maxPattern) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
