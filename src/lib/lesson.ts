import { asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, t } from "@/db";
import { settings, usdToJpy } from "./config";
import { DAY_MS, isoDateJst } from "./format";
import { addDays, mondayOf, SYLLABUS, syllabusPosition, type SyllabusPosition } from "./syllabus";

type Profile = typeof t.profile.$inferSelect;
type ProfilePatch = Partial<Pick<Profile, "about" | "goals" | "interests" | "level" | "learnerModel">>;

export async function getProfile() {
  const [p] = await db().select().from(t.profile).where(eq(t.profile.id, 1));
  if (p) return p;
  const [created] = await db().insert(t.profile).values({ id: 1 }).returning();
  return created;
}

export const clampLevel = (level: number) => Math.min(10, Math.max(1, Math.round(level)));

/** プロフィール（1行だけの表）の更新。行がなければ作る */
export function updateProfileQuery(patch: ProfilePatch) {
  const set = { ...patch, ...(patch.level !== undefined ? { level: clampLevel(patch.level) } : {}), updatedAt: new Date() };
  return db().insert(t.profile).values({ id: 1, ...set }).onConflictDoUpdate({ target: t.profile.id, set });
}

type Override = typeof t.curriculum.$inferSelect;

/** 指定した週（月曜の日付）の上書きをまとめて取得する */
async function getOverrides(weekStarts: string[]) {
  const rows = await db()
    .select()
    .from(t.curriculum)
    .where(inArray(t.curriculum.weekStart, weekStarts))
    .orderBy(asc(t.curriculum.id));
  return new Map(rows.map((r) => [r.weekStart, r])); // 同じ週は新しい行が勝つ
}

/** 全体カリキュラムの週に、上書きで指定された項目（null 以外）だけを重ねる。週の内容を決める唯一の場所 */
function resolveWeek(base: SyllabusPosition, override: Override | undefined) {
  return {
    ...base,
    overrideId: override?.id ?? null,
    theme: override?.theme ?? base.theme,
    focus: override?.focus ?? base.focus,
    scenarioIds: override?.scenarioIds ?? base.scenarioIds,
    categories: override?.categories ?? base.categories,
  };
}
export type Curriculum = ReturnType<typeof resolveWeek>;

/** 指定した日付それぞれの週の内容（プロフィールと上書きは1回ずつだけ読む） */
export async function getCurriculumFor(dates: string[]) {
  const weekStarts = dates.map(mondayOf);
  const [profile, overrides] = await Promise.all([getProfile(), getOverrides(weekStarts)]);
  return {
    profile,
    weeks: dates.map((date, i) => resolveWeek(syllabusPosition(profile, date), overrides.get(weekStarts[i]))),
  };
}

/**
 * 今の周の Week 1〜12（一覧表示用）。週番号は全体カリキュラムの順のまま、
 * 日付は「今後は繰り返しなしで進む」前提の予定日で、上書きを探すのに使う。
 */
export async function getCycleWeeks() {
  const profile = await getProfile();
  const current = syllabusPosition(profile, isoDateJst(new Date()));
  // 開始日より前（開始待ち）のときは、開始週を Week 1 とする
  const fromCurrent = addDays(current.weekStart, -(current.week - 1) * 7);
  const start = addDays(mondayOf(profile.programStart), profile.weekOffset * 7);
  const week1 = current.cycle === 1 && start > fromCurrent ? start : fromCurrent;
  const dates = SYLLABUS.map((_, i) => addDays(week1, i * 7));
  const overrides = await getOverrides(dates);
  return {
    profile,
    currentWeek: current.week,
    weeks: SYLLABUS.map((w, i) =>
      resolveWeek({ ...w, week: i + 1, cycle: current.cycle, weekStart: dates[i] }, overrides.get(dates[i])),
    ),
  };
}

/** 今週の内容とプロフィール */
export async function getCurrentCurriculum() {
  const { profile, weeks } = await getCurriculumFor([isoDateJst(new Date())]);
  return { profile, curriculum: weeks[0] };
}

const REVIEW_INTERVAL_MS = 7 * DAY_MS;

/** 最後の週次レビュー（なければ最初のセッション）から7日以上たっているか */
export async function isReviewDue() {
  const [[review], [first]] = await Promise.all([
    db().select({ at: t.weeklyReviews.createdAt }).from(t.weeklyReviews).orderBy(desc(t.weeklyReviews.createdAt)).limit(1),
    db().select({ at: t.sessions.startedAt }).from(t.sessions).where(eq(t.sessions.status, "done")).orderBy(asc(t.sessions.startedAt)).limit(1),
  ]);
  const since = review?.at ?? first?.at;
  return Boolean(since && Date.now() - since.getTime() > REVIEW_INTERVAL_MS);
}

export async function budgetStatus() {
  const [r] = await db()
    .select({ total: sql<number>`coalesce(sum(${t.sessions.costUsd}), 0)` })
    .from(t.sessions)
    .where(gte(t.sessions.startedAt, sql`date_trunc('month', now())`));
  const spentJpy = usdToJpy(Number(r.total));
  const budgetJpy = settings().monthlyBudgetJpy;
  return { spentJpy, budgetJpy, exceeded: spentJpy >= budgetJpy };
}

export async function topErrorPatterns(limit = 8) {
  return db()
    .select()
    .from(t.errorPatterns)
    .where(eq(t.errorPatterns.resolved, false))
    .orderBy(desc(t.errorPatterns.lastSeenAt), desc(t.errorPatterns.count))
    .limit(limit);
}
