/** 初期データ投入: 表現集（フレーズ・単語/熟語）・お題カード・プロフィール。何度実行しても重複しない。 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db, t } from "@/db";
import type { ScenarioCard } from "@/db/schema";
import { ExpressionInput } from "@/lib/expressions";

async function main() {
  const load = (file: string) => z.array(ExpressionInput).parse(JSON.parse(readFileSync(file, "utf-8")));
  const expressions = [...load("data/expressions.json"), ...load("data/vocabulary.json")];
  const inserted = await db()
    .insert(t.expressions)
    .values(expressions.map((e) => ({ ...e, source: "seed", status: "queued" as const })))
    .onConflictDoNothing()
    .returning({ id: t.expressions.id });

  await db()
    .insert(t.profile)
    .values({
      id: 1,
      about:
        "University student in Japan who will join a company in 2028 and may be assigned to overseas projects. TOEIC 905 (strong reading and listening) but not confident in speaking.",
      goals: "Communicate on equal terms with native speakers in business meetings, negotiations, and presentations.",
      level: 6,
    })
    .onConflictDoNothing();

  // お題カード: シナリオごとの配列。slug（シナリオ ID と番号）で同じ行を更新するので、文面を直して入れ直せる
  const cardFile = JSON.parse(readFileSync("data/cards.json", "utf-8")) as Record<string, ScenarioCard[]>;
  const cards = Object.entries(cardFile).flatMap(([scenarioId, list]) =>
    list.map((card, i) => ({ slug: `${scenarioId}-${String(i + 1).padStart(2, "0")}`, scenarioId, card })),
  );
  await db()
    .insert(t.scenarioCards)
    .values(cards)
    .onConflictDoUpdate({
      target: t.scenarioCards.slug,
      set: { card: sql`excluded.card`, scenarioId: sql`excluded.scenario_id` },
    });

  console.log(
    `expressions: ${inserted.length} inserted (${expressions.length} in seed file), cards: ${cards.length} upserted`,
  );
}

// process.exit() は Windows で libuv のアサーションに当たるため exitCode で終える
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
