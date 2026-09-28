/** セッションのライフサイクル（開始 → 途中保存 → 終了 → 分析）。ルートハンドラとページはここを呼ぶだけにする */
import { and, count, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { db, t } from "@/db";
import type { SessionStatus, Turn, Usage } from "@/db/schema";
import { runAnalysis } from "./analysis";
import {
  ANALYSIS_STALE_MS,
  azureBilledSeconds,
  BUDGET_HARD_CAP_RATIO,
  MAX_RESPONSE_TOKENS,
  PRICING,
  realtimeCostUsd,
  SESSION_GRACE_MIN,
  sessionCostUsd,
  sessionMinutes,
  settings,
  STALE_SESSION_MIN,
  TRANSCRIBE_MODEL,
  transcribeCostUsd,
  turnDetectionFor,
  TURN_WAITS,
  type TurnWait,
  VOICE,
} from "./config";
import { getCard } from "./cards";
import { buildInstructions, buildTranscriptionPrompt } from "./conversation-prompt";
import { attachToSession, getPicked, markShownQuery } from "./expressions";
import { budgetStatus, getCurrentCurriculum, topErrorPatterns } from "./lesson";
import { getScenario, speechSpeed } from "./scenarios";

/** 会話中の文字起こしの設定 */
type TranscriptionConfig = { model: string; language: string; prompt: string };

/** Realtime API の一時トークンを発行する。ブラウザにはこれだけを渡し、API キーはサーバーに置く */
async function createClientSecret(opts: {
  instructions: string;
  speed: number;
  transcription: TranscriptionConfig;
  turnWait: TurnWait;
}) {
  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      expires_after: { anchor: "created_at", seconds: 600 },
      session: {
        type: "realtime",
        model: PRICING.realtime.model,
        instructions: opts.instructions,
        max_output_tokens: MAX_RESPONSE_TOKENS,
        audio: {
          input: {
            // マイク付きイヤホン前提のノイズ除去（発話検出と文字起こしの精度が上がる）
            noise_reduction: { type: "near_field" },
            transcription: opts.transcription,
            // 手動なら自動判定なし。自動なら無音の長さではなく「言い終わったか」で判定する
            turn_detection: turnDetectionFor(opts.turnWait),
          },
          output: { voice: VOICE, speed: opts.speed },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { value: string }).value;
}

/** 開始の入力。重複した表現は除く（セッションとの紐付けの一意制約で失敗するため） */
export const StartInput = z.object({
  scenarioId: z.string().min(1).max(64),
  picks: z
    .array(z.object({ id: z.number().int().positive(), role: z.enum(["new", "review"]) }))
    .max(20)
    .transform((ps) => ps.filter((p, i) => ps.findIndex((q) => q.id === p.id) === i)),
  force: z.boolean().optional(),
  turnWait: z.enum(TURN_WAITS).optional().catch("manual"),
  /** 会話の長さ（分）。選べる長さ以外は上限に丸める */
  minutes: z.number().int().positive().optional(),
  /** 今回のお題カード（準備画面で見せたもの。再挑戦では前と同じカード） */
  cardId: z.number().int().positive().optional(),
});

const tokens = z.number().nonnegative().optional();
/** 終了・途中保存の入力（ブラウザで数えた Realtime / 文字起こしの usage を含む） */
export const EndInput = z.object({
  turns: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string().max(10_000),
        seq: z.number().int().positive().optional(),
        latencyMs: z.number().int().nonnegative().optional(),
      }),
    )
    .max(1000),
  durationSec: z.number().nonnegative(),
  realtimeUsage: z
    .object({
      input_token_details: z
        .object({
          text_tokens: tokens,
          audio_tokens: tokens,
          cached_tokens_details: z.object({ text_tokens: tokens, audio_tokens: tokens }).optional(),
        })
        .optional(),
      output_token_details: z.object({ text_tokens: tokens, audio_tokens: tokens }).optional(),
    })
    .default({}),
  transcriptionUsage: z
    .object({
      audioTokens: z.number().nonnegative(),
      textTokens: z.number().nonnegative(),
      outputTokens: z.number().nonnegative(),
      seconds: z.number().nonnegative(),
    })
    .optional(),
});
export type EndInput = z.infer<typeof EndInput>;

export type StartResult =
  | { ok: true; sessionId: number; clientSecret: string; maxMinutes: number }
  | { ok: false; reason: "budget" | "budget_hard_cap" | "unknown_scenario" };

/** 前回（分析済みの直近セッション）のフィードバックで一番大事だった改善点 */
async function lastHomework() {
  const [s] = await db()
    .select({ topPoints: t.sessions.topPoints })
    .from(t.sessions)
    .where(eq(t.sessions.status, "done"))
    .orderBy(desc(t.sessions.startedAt))
    .limit(1);
  return s?.topPoints?.[0] ?? null;
}

export async function startSession(input: z.infer<typeof StartInput>): Promise<StartResult> {
  const scenario = getScenario(input.scenarioId);
  if (!scenario) return { ok: false, reason: "unknown_scenario" };

  const [budget, { profile, curriculum }, expressions, patterns, homework, cardRow] = await Promise.all([
    budgetStatus(),
    getCurrentCurriculum(),
    getPicked(input.picks),
    topErrorPatterns(3),
    lastHomework(),
    input.cardId ? getCard(input.cardId) : null,
    // 前回の会話が終了の連絡なしに残っていたら、ここで締めて費用を予算に反映する（失敗しても開始は止めない）
    sweepStaleSessions().catch((e) => {
      console.error("sweep stale sessions failed", e);
      return 0;
    }),
  ]);
  // 「それでも始める」で超えられるのは予算の一定倍まで
  if (budget.spentJpy >= budget.budgetJpy * BUDGET_HARD_CAP_RATIO) return { ok: false, reason: "budget_hard_cap" };
  if (budget.exceeded && !input.force) return { ok: false, reason: "budget" };
  // 別のシナリオのカードが渡されたら使わない
  const card = cardRow?.scenarioId === scenario.id ? cardRow : null;

  const transcription: TranscriptionConfig = {
    model: TRANSCRIBE_MODEL,
    language: "en",
    prompt: buildTranscriptionPrompt({ scenario, profile }),
  };
  const clientSecret = await createClientSecret({
    instructions: buildInstructions({
      profile,
      scenario,
      expressions,
      focus: curriculum.focus,
      patterns: patterns.map((p) => p.label),
      homework,
      card: card?.card,
    }),
    speed: speechSpeed(profile.level),
    transcription,
    turnWait: input.turnWait ?? "manual",
  });
  const maxMinutes = sessionMinutes(input.minutes);
  const [session] = await db()
    .insert(t.sessions)
    .values({ scenarioId: scenario.id, level: profile.level, maxMinutes, homeworkGiven: homework, cardId: card?.id })
    .returning({ id: t.sessions.id });
  if (expressions.length) await attachToSession(session.id, expressions);

  return { ok: true, sessionId: session.id, clientSecret, maxMinutes };
}

const maxMinutesOf = (s: { maxMinutes: number | null }) => s.maxMinutes ?? settings().sessionMaxMinutes;

/** 発話を受け付けてよいか: セッションがあり、進行中で、時間制限（選んだ長さ＋猶予）内か */
export async function acceptsUtterance(sessionId: number): Promise<"ok" | "not_found" | "closed"> {
  const [s] = await db()
    .select({ status: t.sessions.status, startedAt: t.sessions.startedAt, maxMinutes: t.sessions.maxMinutes })
    .from(t.sessions)
    .where(eq(t.sessions.id, sessionId));
  if (!s) return "not_found";
  const limitMs = (maxMinutesOf(s) + SESSION_GRACE_MIN) * 60_000;
  return s.status === "active" && Date.now() - s.startedAt.getTime() <= limitMs ? "ok" : "closed";
}

/** 会話の記録と費用をまとめる。文字起こしが届かなかった発話は、Azure が聞き取った文で補う */
async function tally(sessionId: number, maxMinutes: number, body: EndInput) {
  const spoken = await db()
    .select({
      seq: t.utterances.seq,
      heard: t.utterances.heard,
      durationMs: t.utterances.durationMs,
      assessed: sql<boolean>`${t.utterances.accuracy} is not null`,
    })
    .from(t.utterances)
    .where(eq(t.utterances.sessionId, sessionId));
  const heard = new Map(spoken.map((u) => [u.seq, u.heard.trim()]));
  const turns: Turn[] = body.turns.flatMap((x) => {
    const text = x.text.trim() || (x.role === "user" && x.seq !== undefined ? (heard.get(x.seq) ?? "") : "");
    return text ? [{ ...x, text }] : [];
  });
  const speakingMs = spoken.reduce((s, u) => s + u.durationMs, 0);
  const usage: Usage = {
    realtimeUsd: realtimeCostUsd(body.realtimeUsage) + transcribeCostUsd(speakingMs, body.transcriptionUsage),
    azureSeconds: azureBilledSeconds(spoken.filter((u) => u.assessed).map((u) => u.durationMs)),
    claudeInputTokens: 0,
    claudeOutputTokens: 0,
  };
  // 端末の時計のずれなどで極端な値を保存しない（選んだ長さ＋猶予まで）
  const durationSec = Math.round(Math.min(body.durationSec, (maxMinutes + SESSION_GRACE_MIN) * 60));
  return { turns, usage, durationSec };
}

async function getActive(sessionId: number) {
  const [s] = await db()
    .select({ status: t.sessions.status, maxMinutes: t.sessions.maxMinutes })
    .from(t.sessions)
    .where(eq(t.sessions.id, sessionId));
  return s;
}

const isActive = (sessionId: number) => and(eq(t.sessions.id, sessionId), eq(t.sessions.status, "active"));

/** 会話の途中保存。タブを閉じた・落ちたときも、ここまでの会話と費用が残る（終了済みなら何もしない） */
export async function checkpointSession(sessionId: number, body: EndInput) {
  const s = await getActive(sessionId);
  if (!s) return "not_found" as const;
  if (s.status !== "active") return "already_ended" as const;
  const { turns, usage, durationSec } = await tally(sessionId, maxMinutesOf(s), body);
  await db()
    .update(t.sessions)
    .set({ turns, durationSec, usage, costUsd: sessionCostUsd(usage) })
    .where(isActive(sessionId));
  return "ok" as const;
}

/**
 * 進行中のセッションを終了状態にする。状態の切り替えは条件付き更新で1回だけ成功するので、
 * 終了が二重に届いても分析は1回しか走らない。発話があれば分析を始める
 */
async function finalize(sessionId: number, turns: Turn[], durationSec: number, usage: Usage) {
  const d = db();
  const userTurns = turns.filter((x) => x.role === "user" && x.seq !== undefined && x.text.trim());
  const hasSpeech = userTurns.length > 0;
  const [claimed] = await d
    .update(t.sessions)
    .set({
      turns,
      durationSec,
      usage,
      costUsd: sessionCostUsd(usage),
      status: hasSpeech ? "analyzing" : "error",
      error: hasSpeech ? null : "発話が記録されませんでした",
      analysisStartedAt: hasSpeech ? new Date() : null,
    })
    .where(isActive(sessionId))
    .returning({ id: t.sessions.id });
  if (!claimed || !hasSpeech) return Boolean(claimed);

  // Realtime 側の文字起こしを発話レコードへ一括反映
  await d.execute(sql`
    update utterances u set transcript = v.text
    from (values ${sql.join(
      userTurns.map((x) => sql`(${x.seq}::int, ${x.text})`),
      sql`, `,
    )}) as v(seq, text)
    where u.session_id = ${sessionId} and u.seq = v.seq`);
  await markShownQuery(sessionId);
  after(() => runAnalysis(sessionId));
  return true;
}

/** 会話終了: 文字起こしとコストを保存し、発話があれば分析を始める。終了済みなら何もしない（再送に耐える） */
export async function finishSession(sessionId: number, body: EndInput) {
  const s = await getActive(sessionId);
  if (!s) return "not_found" as const;
  if (s.status !== "active") return "already_ended" as const;
  const { turns, usage, durationSec } = await tally(sessionId, maxMinutesOf(s), body);
  return (await finalize(sessionId, turns, durationSec, usage)) ? ("ok" as const) : ("already_ended" as const);
}

/**
 * 終了の連絡がないまま時間（選んだ長さ＋STALE_SESSION_MIN）を過ぎたセッション（タブを閉じた・端末が落ちた）を、
 * 途中保存の内容で終了させる。次のセッション開始時に呼ぶ
 */
export async function sweepStaleSessions() {
  const fallback = Math.round(settings().sessionMaxMinutes);
  const stale = await db()
    .select({
      id: t.sessions.id,
      turns: t.sessions.turns,
      durationSec: t.sessions.durationSec,
      usage: t.sessions.usage,
    })
    .from(t.sessions)
    .where(
      and(
        eq(t.sessions.status, "active"),
        lt(
          t.sessions.startedAt,
          sql`now() - (coalesce(${t.sessions.maxMinutes}, ${fallback}) + ${STALE_SESSION_MIN}) * interval '1 minute'`,
        ),
      ),
    );
  for (const s of stale) {
    const usage = s.usage ?? { realtimeUsd: 0, azureSeconds: 0, claudeInputTokens: 0, claudeOutputTokens: 0 };
    await finalize(s.id, s.turns, s.durationSec, usage);
  }
  return stale.length;
}

/** 接続できずに始まらなかったセッションを消す（会話や発話の記録が1つでもあれば残す） */
export async function abortSession(sessionId: number) {
  const d = db();
  const [{ n }] = await d.select({ n: count() }).from(t.utterances).where(eq(t.utterances.sessionId, sessionId));
  if (n) return false;
  const [deleted] = await d
    .delete(t.sessions)
    .where(and(isActive(sessionId), sql`jsonb_array_length(${t.sessions.turns}) = 0`))
    .returning({ id: t.sessions.id });
  if (deleted) await d.delete(t.sessionExpressions).where(eq(t.sessionExpressions.sessionId, sessionId));
  return Boolean(deleted);
}

/** 分析中のまま止まっているか（関数の実行時間切れなど）。止まっていればやり直せる */
export function isAnalysisStale(s: { status: SessionStatus; analysisStartedAt: Date | null }) {
  return (
    s.status === "analyzing" && (!s.analysisStartedAt || Date.now() - s.analysisStartedAt.getTime() > ANALYSIS_STALE_MS)
  );
}

/**
 * 失敗した・止まった分析のやり直し。状態の切り替えを条件付き更新で行い、連打や二重送信でも1回だけ走らせる。
 * 走らせたら true
 */
export async function requestAnalysis(sessionId: number) {
  const staleBefore = new Date(Date.now() - ANALYSIS_STALE_MS);
  const [claimed] = await db()
    .update(t.sessions)
    .set({ status: "analyzing", error: null, analysisStartedAt: new Date() })
    .where(
      and(
        eq(t.sessions.id, sessionId),
        or(
          eq(t.sessions.status, "error"),
          and(
            eq(t.sessions.status, "analyzing"),
            or(isNull(t.sessions.analysisStartedAt), lt(t.sessions.analysisStartedAt, staleBefore)),
          ),
        ),
      ),
    )
    .returning({ id: t.sessions.id });
  if (claimed) after(() => runAnalysis(sessionId));
  return Boolean(claimed);
}
