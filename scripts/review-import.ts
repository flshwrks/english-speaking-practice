/**
 * 週次レビューの結果（JSON）を DB に書き込む。全体カリキュラムは自動で進むので、ここでは調整だけを行う。
 * 使い方: npm run review:import -- reviews/<date>-plan.json
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, t } from "@/db";
import { EXPRESSION_CATEGORIES } from "@/lib/categories";
import { ExpressionInput } from "@/lib/expressions";
import { updateProfileQuery } from "@/lib/lesson";
import { isoDateJst } from "@/lib/format";
import { SCENARIOS } from "@/lib/scenarios";
import { mondayOf } from "@/lib/syllabus";

/** 指定した項目だけを差し替える（省略した項目は全体カリキュラムのまま） */
const Override = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  theme: z.string().min(1).optional(),
  focus: z.string().min(1).optional(),
  scenarioIds: z.array(z.enum(SCENARIOS.map((s) => s.id) as [string, ...string[]])).min(1).optional(),
  categories: z.array(z.enum(EXPRESSION_CATEGORIES)).min(1).optional(),
});

const Plan = z.object({
  summary: z.string().min(1),
  userComment: z.string().default(""),
  /** 全体カリキュラムのその週だけを差し替える（不要なら省略） */
  override: Override.optional(),
  /** 来週も今週と同じ週の内容を繰り返す（profile.weekOffset を1増やし、進行を1週遅らせる） */
  repeatWeek: z.boolean().default(false),
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

  if (plan.override) await d.insert(t.curriculum).values({ ...plan.override, weekStart: mondayOf(plan.override.weekStart) });
  await d.insert(t.weeklyReviews).values({
    weekStart: mondayOf(isoDateJst(new Date())),
    summary: plan.summary,
    userComment: plan.userComment,
  });

  const added = plan.expressions.length
    ? await d
        .insert(t.expressions)
        .values(
          plan.expressions.map((e) => ({ ...e, source: "review", status: "queued" as const })),
        )
        .onConflictDoNothing()
        .returning({ id: t.expressions.id })
    : [];

  if (plan.resolvePatterns.length) {
    await d.update(t.errorPatterns).set({ resolved: true }).where(inArray(t.errorPatterns.key, plan.resolvePatterns));
  }
  if (plan.level || plan.profile) await updateProfileQuery({ ...plan.profile, level: plan.level });
  if (plan.repeatWeek) {
    await d.update(t.profile).set({ weekOffset: sql`${t.profile.weekOffset} + 1` }).where(eq(t.profile.id, 1));
  }

  console.log(
    [
      plan.override ? `override: ${mondayOf(plan.override.weekStart)} の週` : "override: なし",
      `repeatWeek: ${plan.repeatWeek}`,
      `expressions +${added.length}/${plan.expressions.length}`,
      `resolved ${plan.resolvePatterns.length}`,
    ].join(", "),
  );
}

// process.exit() は Windows で libuv のアサーションに当たるため exitCode で終える
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
