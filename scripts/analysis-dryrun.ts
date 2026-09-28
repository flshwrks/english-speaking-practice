/**
 * 会話後の分析を、DB に書かずに試す（プロンプトや指標の計算を変えたときの確認用）。
 * 使い方: npx tsx --env-file=.env.local scripts/analysis-dryrun.ts <sessionId> [--prompt]
 *   --prompt: 分析 AI に渡す入力文だけ表示する（API を呼ばないので無料）
 * それ以外は Claude を1回呼び（有料, 1回数円）、後処理済みの結果・指標・次回の難易度を JSON で表示する。
 */
import { eq } from "drizzle-orm";
import { db, t } from "@/db";
import { buildAnalysisInput, callAnalysisModel, finalizeAnalysis } from "@/lib/analysis";
import { sessionCostUsd } from "@/lib/config";

async function main() {
  const sessionId = Number(process.argv[2]);
  if (!sessionId) throw new Error("使い方: scripts/analysis-dryrun.ts <sessionId> [--prompt]");
  const input = await buildAnalysisInput(sessionId);
  if (process.argv.includes("--prompt")) {
    console.log(input.userText);
    return;
  }
  const started = Date.now();
  const { analysis, inputTokens, outputTokens } = await callAnalysisModel(input.userText);
  const result = finalizeAnalysis(input, analysis);
  const stored = await db()
    .select({ metrics: t.sessions.metrics })
    .from(t.sessions)
    .where(eq(t.sessions.id, sessionId));
  const costUsd = sessionCostUsd({
    realtimeUsd: 0,
    azureSeconds: 0,
    claudeInputTokens: inputTokens,
    claudeOutputTokens: outputTokens,
  });
  console.log(
    JSON.stringify(
      {
        call: { seconds: (Date.now() - started) / 1000, inputTokens, outputTokens, costUsd },
        rawItemCount: analysis.items.length,
        result,
        storedMetrics: stored[0]?.metrics ?? null,
        currentLevel: input.profile.level,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
