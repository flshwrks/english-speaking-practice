import { asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db, t } from "@/db";
import type { Expression } from "./expressions";
import { levelGuidance, type Scenario } from "./scenarios";
import { settings, usdToJpy } from "./config";

type Profile = typeof t.profile.$inferSelect;
type ProfilePatch = Partial<Pick<Profile, "about" | "goals" | "interests" | "level">>;

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

export async function getCurrentCurriculum() {
  const [c] = await db()
    .select()
    .from(t.curriculum)
    .where(lte(t.curriculum.weekStart, sql`CURRENT_DATE`))
    .orderBy(desc(t.curriculum.weekStart), desc(t.curriculum.id))
    .limit(1);
  return c ?? null;
}
export type Curriculum = NonNullable<Awaited<ReturnType<typeof getCurrentCurriculum>>>;

const REVIEW_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

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

export function buildInstructions(opts: {
  profile: Profile;
  scenario: Scenario;
  expressions: Pick<Expression, "text" | "scene">[];
  focus: string | null;
}) {
  const { profile, scenario, expressions, focus } = opts;
  return `# Role
${scenario.role}

# Learner
A Japanese business professional practicing spoken English for future overseas projects.
${profile.about ? `About them: ${profile.about}` : ""}
${profile.interests ? `Interests: ${profile.interests}` : ""}
${focus ? `This week's focus: ${focus}` : ""}

# How to speak
- ${levelGuidance(profile.level)}
- Stay fully in character as a native English speaker in a real business situation. Keep each turn short (1-3 sentences) so the learner does most of the talking.
- Do NOT correct the learner's English during the conversation. Detailed feedback is given after the session. Just respond naturally to the meaning.
- If the learner is stuck or silent, help them with a simpler follow-up question or a hint, then continue.
- If the learner speaks Japanese, gently ask them to try in English.
- Start the conversation yourself with a natural opening line for this situation.

# Target expressions
The learner wants to practice these expressions today:
${expressions.map((e) => `- "${e.text}" (${e.scene})`).join("\n")}
Naturally create situations where each expression would fit (for example, make a proposal they could push back on). Never say the expressions yourself, never mention the list, and never prompt them to use a specific phrase.`;
}
