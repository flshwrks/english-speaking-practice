/**
 * 週次レビューの結果（JSON）を DB に書き込む。
 * 使い方: npm run review:import -- reviews/<date>-plan.json
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db, t } from "@/db";
import { EXPRESSION_CATEGORIES } from "@/lib/categories";
import { ExpressionInput } from "@/lib/expressions";
import { updateProfileQuery } from "@/lib/lesson";
import { SCENARIOS } from "@/lib/scenarios";

const Plan = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  theme: z.string().min(1),
  focus: z.string().default(""),
  scenarioIds: z.array(z.enum(SCENARIOS.map((s) => s.id) as [string, ...string[]])).default([]),
  categories: z.array(z.enum(EXPRESSION_CATEGORIES)).default([]),
  summary: z.string().min(1),
  userComment: z.string().default(""),
  expressions: z.array(ExpressionInput).default([]),
  resolvePatterns: z.array(z.string()).default([]),
  level: z.number().int().min(1).max(10).optional(),
  profile: z
    .object({ about: z.string().optional(), goals: z.string().optional(), interests: z.string().optional() })
    .optional(),
});

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("JSON ファイルのパスを指定してください");
  const plan = Plan.parse(JSON.parse(readFileSync(file, "utf-8")));
  const d = db();

  const [cur] = await d
    .insert(t.curriculum)
    .values({
      weekStart: plan.weekStart,
      theme: plan.theme,
      focus: plan.focus,
      scenarioIds: plan.scenarioIds,
      categories: plan.categories,
    })
    .returning({ id: t.curriculum.id });

  await d.insert(t.weeklyReviews).values({
    weekStart: plan.weekStart,
    summary: plan.summary,
    userComment: plan.userComment,
  });

  const added = plan.expressions.length
    ? await d
        .insert(t.expressions)
        .values(plan.expressions.map((e) => ({ ...e, source: "review", status: "queued" as const, curriculumId: cur.id })))
        .onConflictDoNothing()
        .returning({ id: t.expressions.id })
    : [];

  if (plan.resolvePatterns.length) {
    await d.update(t.errorPatterns).set({ resolved: true }).where(inArray(t.errorPatterns.key, plan.resolvePatterns));
  }
  if (plan.level || plan.profile) await updateProfileQuery({ ...plan.profile, level: plan.level });

  console.log(
    `curriculum #${cur.id} (${plan.weekStart}: ${plan.theme}), expressions +${added.length}/${plan.expressions.length}, resolved ${plan.resolvePatterns.length}`,
  );
}

// process.exit() は Windows で libuv のアサーションに当たるため exitCode で終える
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
