/** 初期データ投入: 表現集とプロフィール。何度実行しても重複しない。 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import { z } from "zod";
import { db, t } from "@/db";
import { ExpressionInput } from "@/lib/expressions";

async function main() {
  const expressions = z.array(ExpressionInput).parse(JSON.parse(readFileSync("data/expressions.json", "utf-8")));
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

  console.log(`expressions: ${inserted.length} inserted (${expressions.length} in seed file)`);
}

// process.exit() は Windows で libuv のアサーションに当たるため exitCode で終える
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
