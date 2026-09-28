/**
 * 1回だけ実行: カタログ導入前の自由な key（error_patterns / feedback_items）をカタログの key に寄せる。
 * 同じ型に寄る行は回数を合算し、最終出現は新しいほう、克服済みはすべて克服済みのときだけ。何度実行しても結果は同じ。
 * 使い方: npx tsx scripts/migrate-error-patterns.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import type { BatchItem } from "drizzle-orm/batch";
import { eq, inArray } from "drizzle-orm";
import { db, t } from "@/db";
import { canonicalPatternKey, errorPattern } from "@/lib/error-patterns";

async function main() {
  const d = db();
  const rows = await d.select().from(t.errorPatterns);
  const legacy = rows.filter((r) => canonicalPatternKey(r.key) !== r.key);
  if (!legacy.length) return console.log("移行が必要な行はありません");

  // 旧 key を含む型ごとに、その型の行をすべて消して1行に合算し直す
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = canonicalPatternKey(r.key);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const touched = [...groups].filter(([key, group]) => group.some((r) => r.key !== key));
  const writes: BatchItem<"pg">[] = legacy.map((r) =>
    d
      .update(t.feedbackItems)
      .set({ patternKey: canonicalPatternKey(r.key) })
      .where(eq(t.feedbackItems.patternKey, r.key)),
  );
  writes.push(
    d.delete(t.errorPatterns).where(
      inArray(
        t.errorPatterns.key,
        touched.flatMap(([, group]) => group.map((r) => r.key)),
      ),
    ),
  );
  for (const [key, group] of touched) {
    const def = errorPattern(key)!;
    writes.push(
      d.insert(t.errorPatterns).values({
        key,
        label: def.label,
        category: def.category,
        count: group.reduce((s, r) => s + r.count, 0),
        lastSeenAt: new Date(Math.max(...group.map((r) => r.lastSeenAt.getTime()))),
        resolved: group.every((r) => r.resolved),
      }),
    );
  }
  await d.batch(writes as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
  console.log(legacy.map((r) => `${r.key} → ${canonicalPatternKey(r.key)}`).join("\n"));
}

// process.exit() は Windows で libuv のアサーションに当たるため exitCode で終える
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
