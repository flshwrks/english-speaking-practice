/** セッションのライフサイクル（開始 → 終了 → 分析）。ルートハンドラとページはここを呼ぶだけにする */
import { eq, sql } from "drizzle-orm";
import { after } from "next/server";
import { db, t } from "@/db";
import type { Turn, Usage } from "@/db/schema";
import { runAnalysis } from "./analysis";
import {
  azureBilledSeconds,
  PRICING,
  realtimeCostUsd,
  sessionCostUsd,
  settings,
  TRANSCRIBE_MODEL,
  VOICE,
  type RealtimeUsage,
} from "./config";
import { attachToSession, getPicked, markShownQuery, type ExpressionPick } from "./expressions";
import { budgetStatus, buildInstructions, getCurrentCurriculum, getProfile } from "./lesson";
import { getScenario } from "./scenarios";

/** Realtime API の一時トークンを発行する。ブラウザにはこれだけを渡し、API キーはサーバーに置く */
async function createClientSecret(instructions: string) {
  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      expires_after: { anchor: "created_at", seconds: 600 },
      session: {
        type: "realtime",
        model: PRICING.realtime.model,
        instructions,
        audio: {
          input: {
            transcription: { model: TRANSCRIBE_MODEL, language: "en" },
            turn_detection: { type: "server_vad", silence_duration_ms: 900, prefix_padding_ms: 300 },
          },
          output: { voice: VOICE },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { value: string }).value;
}

export type StartResult =
  | { ok: true; sessionId: number; clientSecret: string; maxMinutes: number }
  | { ok: false; reason: "budget" | "unknown_scenario" };

export async function startSession(input: { scenarioId: string; picks: ExpressionPick[]; force?: boolean }): Promise<StartResult> {
  const scenario = getScenario(input.scenarioId);
  if (!scenario) return { ok: false, reason: "unknown_scenario" };

  const [budget, profile, curriculum, expressions] = await Promise.all([
    budgetStatus(),
    getProfile(),
    getCurrentCurriculum(),
    getPicked(input.picks),
  ]);
  if (budget.exceeded && !input.force) return { ok: false, reason: "budget" };

  const clientSecret = await createClientSecret(
    buildInstructions({ profile, scenario, expressions, focus: curriculum?.focus ?? null }),
  );
  const [session] = await db()
    .insert(t.sessions)
    .values({ scenarioId: scenario.id, level: profile.level })
    .returning({ id: t.sessions.id });
  if (expressions.length) await attachToSession(session.id, expressions);

  return { ok: true, sessionId: session.id, clientSecret, maxMinutes: settings().sessionMaxMinutes };
}

/** 会話終了: 文字起こしとコストを保存し、発話があれば分析を始める */
export async function finishSession(
  sessionId: number,
  body: { turns: Turn[]; durationSec: number; realtimeUsage: RealtimeUsage },
) {
  const d = db();
  const userTurns = body.turns.filter((x) => x.role === "user" && x.seq !== undefined);
  if (userTurns.length) {
    // Realtime 側の文字起こしを発話レコードへ一括反映
    await d.execute(sql`
      update utterances u set transcript = v.text
      from (values ${sql.join(userTurns.map((x) => sql`(${x.seq}::int, ${x.text})`), sql`, `)}) as v(seq, text)
      where u.session_id = ${sessionId} and u.seq = v.seq`);
  }

  const assessed = await d
    .select({ durationMs: t.utterances.durationMs })
    .from(t.utterances)
    .where(sql`${t.utterances.sessionId} = ${sessionId} and ${t.utterances.accuracy} is not null`);
  const usage: Usage = {
    realtimeUsd: realtimeCostUsd(body.realtimeUsage),
    azureSeconds: azureBilledSeconds(assessed.map((u) => u.durationMs)),
    claudeInputTokens: 0,
    claudeOutputTokens: 0,
  };
  const hasSpeech = userTurns.some((x) => x.text.trim());

  if (hasSpeech) await markShownQuery(sessionId);
  await d
    .update(t.sessions)
    .set({
      turns: body.turns,
      durationSec: Math.round(body.durationSec),
      usage,
      costUsd: sessionCostUsd(usage),
      status: hasSpeech ? "analyzing" : "error",
      error: hasSpeech ? null : "発話が記録されませんでした",
    })
    .where(eq(t.sessions.id, sessionId));
  if (hasSpeech) after(() => runAnalysis(sessionId));
}

/** 失敗した分析のやり直し */
export async function requestAnalysis(sessionId: number) {
  await db().update(t.sessions).set({ status: "analyzing", error: null }).where(eq(t.sessions.id, sessionId));
  after(() => runAnalysis(sessionId));
}
