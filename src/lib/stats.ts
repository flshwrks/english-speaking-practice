/** 画面表示用の練習の集計（読み取りのみ） */
import { and, eq, gte, sql } from "drizzle-orm";
import { db, t } from "@/db";
import { DAY_MS, isoDateJst } from "./format";
import { mondayOf } from "./syllabus";

/** 練習日ごとの回数から、連続日数・今週の回数を求める（DB を読まない） */
export function summarizePractice(byDay: Map<string, number>) {
  const today = isoDateJst(new Date());
  const dayBefore = (d: string) => isoDateJst(new Date(Date.parse(`${d}T12:00:00+09:00`) - DAY_MS));
  // 今日まだ練習していなくても、昨日まで続いていれば連続として数える
  let cursor = byDay.has(today) ? today : dayBefore(today);
  let streak = 0;
  while (byDay.has(cursor)) {
    streak++;
    cursor = dayBefore(cursor);
  }
  const weekStart = mondayOf(today);
  const thisWeek = [...byDay].filter(([d]) => d >= weekStart).reduce((s, [, n]) => s + n, 0);
  return { byDay, streak, practicedToday: byDay.has(today), thisWeek, today };
}

/** 完了セッションの開始日時の一覧から、練習日ごとの回数を数える（すでに読み込んだ行を使う画面用） */
export function countByDay(startedAt: Date[]) {
  const byDay = new Map<string, number>();
  for (const d of startedAt) {
    const day = isoDateJst(d);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  return byDay;
}

/** 直近 days 日の練習日ごとの回数を DB 側で集計して取得する（ホーム用） */
export async function practiceSummary(days = 120) {
  const rows = await db()
    .select({
      day: sql<string>`(${t.sessions.startedAt} at time zone 'Asia/Tokyo')::date::text`,
      n: sql<number>`count(*)::int`,
    })
    .from(t.sessions)
    .where(and(eq(t.sessions.status, "done"), gte(t.sessions.startedAt, sql`now() - make_interval(days => ${days})`)))
    .groupBy(sql`1`);
  return summarizePractice(new Map(rows.map((r) => [r.day, r.n])));
}

/** 練習カレンダー用: 直近 weeks 週（月曜始まり）の日付と回数。未来の日は null */
export function calendarWeeks(byDay: Map<string, number>, today: string, weeks = 12) {
  const start = Date.parse(`${mondayOf(today)}T12:00:00+09:00`) - (weeks - 1) * 7 * DAY_MS;
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = isoDateJst(new Date(start + (w * 7 + d) * DAY_MS));
      return date > today ? null : { date, count: byDay.get(date) ?? 0 };
    }),
  );
}
