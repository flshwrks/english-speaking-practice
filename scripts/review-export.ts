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
import { leechExpressions, sessionTargets, srsHealth } from "@/lib/expressions";
import { isoDateJst, targetMark } from "@/lib/format";
import { getCurriculumFor, loadWeaknesses } from "@/lib/lesson";
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
    weaknesses,
    srs,
    leeches,
    statusCounts,
    queuedByCategory,
    [lastReview],
  ] = await Promise.all([
    getCurriculumFor([todayJst, addDays(todayJst, 7)]),
    d.select().from(t.sessions).where(gte(t.sessions.startedAt, since)).orderBy(t.sessions.startedAt),
    loadWeaknesses(),
    srsHealth(),
    leechExpressions(),
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

## 学習者モデル（会話ごとに分析 AI が更新）
${
  profile.learnerModel
    ? `- 人物像: ${profile.learnerModel.portrait}
- 強み: ${profile.learnerModel.strengths.join(" / ")}
- 弱点: ${profile.learnerModel.weaknesses.join(" / ")}
- 苦手な音: ${profile.learnerModel.sounds.join(" / ")}
- 反映したセッション数: ${profile.learnerModel.sessions}`
    : "（まだなし）"
}

## 前回の週次レビュー
${
  lastReview
    ? `- ${lastReview.weekStart}: ${lastReview.summary}
- ユーザーの声: ${lastReview.userComment || "（なし）"}`
    : "（なし）"
}

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

## ミスの型（直近40セッション, 優先度順）
優先度 = Σ 重さ × e^(-経過日数/14)。状態: active / improving（3セッション出ていない）/ resolved（6セッション以上出ていない、または克服済みにした）/ reopened（克服後に再発）
${
  weaknesses
    .map(
      (w) =>
        `- ${w.key}（${w.label}, ${w.category}）: 優先度 ${w.priority}, ${w.state}, ${w.count}件, 最後に出てから${w.sessionsSinceLast}セッション, 再発率 ${Math.round(w.recurrenceRate * 100)}%`,
    )
    .join("\n") || "（なし）"
}

## 今日の表現の結果
${(["new", "review"] as const)
  .map((role) => {
    const rs = targetResults.filter((r) => r.role === role);
    return `- ${role === "new" ? "新規" : "復習"}: 使えた ${rs.filter((r) => r.used).length}/${rs.length}, 正しく ${rs.filter((r) => r.correct).length}/${rs.length}`;
  })
  .join("\n")}

${targetResults.map((r) => `- ${targetMark(r.used, r.correct)} ${r.text}${r.comment ? ` — ${r.comment}` : ""}`).join("\n")}

## 表現リストの状態
${statusCounts.map((c) => `- ${c.status}: ${c.n}`).join("\n")}

間隔反復の健全性:
- 練習中 ${srs.learning}件（まだ一度も使えていない ${srs.neverUsed}件）/ 習得 ${srs.mastered}件
- 今日が期限 ${srs.due}件（うち3日以上超過 ${srs.overdue}件）/ 1週間以内に期限 ${srs.dueNextWeek}件
- 誤用に戻った回数（lapse）累計 ${srs.lapses} / 使えた表現の安定度（中央値）${srs.medianStabilityDays}日
- 苦手（一度も使えないまま3回続けて使わなかった）${srs.leeches}件${leeches.length ? `: ${leeches.map((e) => e.text).join(" / ")}` : ""}

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
