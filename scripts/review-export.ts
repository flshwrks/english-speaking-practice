/**
 * 週次レビュー用に直近のデータを Markdown に書き出す。
 * 使い方: npm run review:export [-- --days 7]
 * 出力: reviews/<today>-export.md
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { mkdirSync, writeFileSync } from "node:fs";
import { count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, t } from "@/db";
import { sessionTargets } from "@/lib/expressions";
import { isoDateJst, targetMark } from "@/lib/format";
import { getCurriculumFor } from "@/lib/lesson";
import { getScenario, SCENARIOS } from "@/lib/scenarios";
import { addDays, SYLLABUS } from "@/lib/syllabus";

const days = Number(process.argv[process.argv.indexOf("--days") + 1]) || 7;

async function main() {
  const d = db();
  const since = sql`now() - make_interval(days => ${days})`;
  const todayJst = isoDateJst(new Date());
  const [
    {
      profile,
      weeks: [curriculum, next],
    },
    sessions,
    patterns,
    statusCounts,
    queuedByCategory,
    [lastReview],
  ] = await Promise.all([
    getCurriculumFor([todayJst, addDays(todayJst, 7)]),
    d.select().from(t.sessions).where(gte(t.sessions.startedAt, since)).orderBy(t.sessions.startedAt),
    d.select().from(t.errorPatterns).where(eq(t.errorPatterns.resolved, false)).orderBy(desc(t.errorPatterns.count)).limit(20),
    d.select({ status: t.expressions.status, n: count() }).from(t.expressions).groupBy(t.expressions.status),
    d
      .select({ category: t.expressions.category, kind: t.expressions.kind, n: count() })
      .from(t.expressions)
      .where(eq(t.expressions.status, "queued"))
      .groupBy(t.expressions.category, t.expressions.kind),
    d.select().from(t.weeklyReviews).orderBy(desc(t.weeklyReviews.createdAt)).limit(1),
  ]);
  const ids = sessions.map((s) => s.id);
  const [items, targetResults] = ids.length
    ? await Promise.all([
        d.select().from(t.feedbackItems).where(inArray(t.feedbackItems.sessionId, ids)),
        sessionTargets(ids),
      ])
    : [[], []];

  const done = sessions.filter((s) => s.status === "done");
  const today = todayJst;
  const md = `# 週次レビュー用データ（${today}, 直近${days}日）

## プロフィール
- 難易度: ${profile.level}/10
- 自己紹介: ${profile.about}
- 目標: ${profile.goals}
- 興味: ${profile.interests}

## 前回の週次レビュー
${lastReview ? `- ${lastReview.weekStart}: ${lastReview.summary}
- ユーザーの声: ${lastReview.userComment || "（なし）"}` : "（なし）"}

## カリキュラム
- 今週: Week ${curriculum.week}/${SYLLABUS.length}（${curriculum.phase}, ${curriculum.cycle}周目, ${curriculum.weekStart}〜）${curriculum.overrideId ? "※調整あり" : ""}${profile.weekOffset ? `（累計 ${profile.weekOffset} 週繰り返し）` : ""}
  - テーマ: ${curriculum.theme}
  - 重点: ${curriculum.focus}
  - シナリオ: ${curriculum.scenarioIds.join(", ")} / カテゴリ: ${curriculum.categories.join(", ")}
- 来週（${next.weekStart}〜, 自動で進む予定）: Week ${next.week} ${next.theme}${next.overrideId ? " ※調整あり" : ""}
  - シナリオ: ${next.scenarioIds.join(", ")} / カテゴリ: ${next.categories.join(", ")}

## セッション（${done.length}件完了 / ${sessions.length}件）
${done
  .map((s) => {
    const m = s.metrics;
    return `### ${isoDateJst(s.startedAt)} ${getScenario(s.scenarioId)?.title ?? s.scenarioId}（難易度${s.level}, ${Math.round(s.durationSec / 60)}分, $${s.costUsd.toFixed(3)}）
- 指標: CEFR ${m?.estimatedCefr}, ${m?.wpm} WPM, 発音 ${m?.accuracy}, 流暢さ ${m?.fluency}, 抑揚 ${m?.prosody}, 誤り/100語 ${m?.errorsPer100Words}, 語彙多様性 ${m?.lexicalDiversity}
- 講評: ${s.summary}
${(s.topPoints ?? []).map((p) => `- 要点: ${p.title} — ${p.detail}`).join("\n")}`;
  })
  .join("\n\n")}

## フィードバック項目（期間内 ${items.length}件）
${Object.entries(
  items.reduce<Record<string, number>>((acc, i) => ({ ...acc, [i.category]: (acc[i.category] ?? 0) + 1 }), {}),
)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}

重大度2以上の例:
${items
  .filter((i) => i.severity >= 2)
  .slice(0, 25)
  .map((i) => `- [${i.category}/${i.patternKey}] "${i.original}" → "${i.improved}"`)
  .join("\n")}

## 未解決のミスの型（累計）
${patterns.map((p) => `- ${p.key}（${p.label}, ${p.category}）: ${p.count}回, 最終 ${isoDateJst(p.lastSeenAt)}`).join("\n")}

## 今日の表現の結果
${targetResults.map((r) => `- ${targetMark(r.used, r.correct)} ${r.text}${r.comment ? ` — ${r.comment}` : ""}`).join("\n")}

## 表現リストの状態
${statusCounts.map((c) => `- ${c.status}: ${c.n}`).join("\n")}

出題待ち（queued）のカテゴリ別件数:
${queuedByCategory.map((c) => `- ${c.category} / ${c.kind}: ${c.n}`).join("\n")}

## 利用可能なシナリオ ID
${SCENARIOS.map((s) => `- ${s.id}: ${s.title}`).join("\n")}
`;

  mkdirSync("reviews", { recursive: true });
  const path = `reviews/${today}-export.md`;
  writeFileSync(path, md);
  console.log(path);
}

// process.exit() は Windows で libuv のアサーションに当たるため exitCode で終える
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
