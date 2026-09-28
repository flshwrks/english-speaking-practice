import { eq, sql } from "drizzle-orm";
import { db, t } from "@/db";
import type { DrillScores, DrillWord } from "@/db/schema";
import { azureConfigured } from "@/lib/azure";
import { assessScripted } from "@/lib/azure-scripted";
import { PRICING } from "@/lib/config";
import { recordDrillSuccess } from "@/lib/expressions";
import { wavSeconds } from "@/lib/wav";

/** 1回の録音の上限（画面側はこの秒数で自動停止する） */
export const DRILL_MAX_SEC = 15;
/** この点以上で「言えた」（言い直し練習のクリア） */
export const DRILL_CLEAR_SCORE = 80;
/** 同じ添削で、直近 RATE_WINDOW_MIN 分に採点できる回数 */
const RATE_LIMIT = 10;
const RATE_WINDOW_MIN = 10;

export type DrillResult = { scores: DrillScores; words: DrillWord[]; best: number };

export class DrillError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** 16kHz mono 16bit の WAV（recorder.ts の toWav の形式）で、長さが範囲内か */
function drillSeconds(wav: Buffer) {
  const sec = wavSeconds(wav);
  if (sec === null) throw new DrillError("録音の形式が正しくありません", 400);
  if (sec < 0.5) throw new DrillError("録音が短すぎます", 400);
  // 停止の遅れのぶん1秒だけ余裕を持たせる
  if (sec > DRILL_MAX_SEC + 1) throw new DrillError(`録音は${DRILL_MAX_SEC}秒までです`, 413);
  return sec;
}

const bestScore = sql<number | null>`max((${t.drillAttempts.scores}->>'score')::real)`;

/** 添削1件の「改善後の文」を声に出したものを採点して保存する。お手本の文は DB から取る（画面から受け取らない） */
export async function runDrill(feedbackItemId: number, wav: Buffer): Promise<DrillResult> {
  if (!azureConfigured()) throw new DrillError("発音評価（Azure）が設定されていません", 503);
  const sec = drillSeconds(wav);
  const d = db();
  const [[item], [past]] = await Promise.all([
    d
      .select({
        improved: t.feedbackItems.improved,
        sessionId: t.feedbackItems.sessionId,
        // この添削の「覚える表現」が表現リストにあればその id
        expressionId: t.expressions.id,
      })
      .from(t.feedbackItems)
      .leftJoin(t.expressions, eq(t.expressions.text, sql`${t.feedbackItems.keyExpression}->>'text'`))
      .where(eq(t.feedbackItems.id, feedbackItemId)),
    d
      .select({
        recent: sql<number>`count(*) filter (where ${t.drillAttempts.createdAt} > now() - make_interval(mins => ${RATE_WINDOW_MIN}))`,
        best: bestScore,
      })
      .from(t.drillAttempts)
      .where(eq(t.drillAttempts.feedbackItemId, feedbackItemId)),
  ]);
  if (!item) throw new DrillError("添削が見つかりません", 404);
  if (Number(past.recent) >= RATE_LIMIT)
    throw new DrillError("続けて採点しすぎています。少し時間をおいてください", 429);

  const { scores, words } = await assessScripted(wav, item.improved);
  // 費用はセッションに足す（ホームの月合計に入る）。会話中と同じく前後の余白ぶんを見込む
  const billedSec = sec + 1.5;
  const charge = d
    .update(t.sessions)
    .set({
      costUsd: sql`${t.sessions.costUsd} + ${(billedSec / 3600) * PRICING.azurePerHour}`,
      usage: sql`jsonb_set(${t.sessions.usage}, '{azureSeconds}',
        to_jsonb(coalesce((${t.sessions.usage}->>'azureSeconds')::float, 0) + ${billedSec}))`,
    })
    .where(eq(t.sessions.id, item.sessionId));
  if (!words.some((w) => w.accuracy != null)) {
    await charge;
    throw new DrillError("声が聞き取れませんでした。マイクに近づいてもう一度どうぞ", 422);
  }
  await d.batch([
    charge,
    d.insert(t.drillAttempts).values({ feedbackItemId, referenceText: item.improved, scores, words }),
  ]);

  const prevBest = past.best == null ? null : Number(past.best);
  // 初めて言えたら、その「覚える表現」の復習間隔を伸ばす
  if (scores.score >= DRILL_CLEAR_SCORE && (prevBest ?? 0) < DRILL_CLEAR_SCORE && item.expressionId != null) {
    await recordDrillSuccess(item.expressionId);
  }
  return { scores, words, best: Math.max(prevBest ?? 0, scores.score) };
}

/** セッションの添削ごとの言い直しのベストスコア（フィードバック画面の「言い直し済み」用） */
export async function bestDrillScores(sessionId: number) {
  const rows = await db()
    .select({ id: t.drillAttempts.feedbackItemId, best: bestScore })
    .from(t.drillAttempts)
    .innerJoin(t.feedbackItems, eq(t.feedbackItems.id, t.drillAttempts.feedbackItemId))
    .where(eq(t.feedbackItems.sessionId, sessionId))
    .groupBy(t.drillAttempts.feedbackItemId);
  return new Map(rows.map((r) => [r.id, Number(r.best)]));
}
