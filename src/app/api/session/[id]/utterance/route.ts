import { NextResponse } from "next/server";
import { z } from "zod";
import { handler, jsonError, parseId } from "@/app/api/_lib/http";
import { db, t } from "@/db";
import { assessPronunciation, azureConfigured, EMPTY_ASSESSMENT } from "@/lib/azure";
import { acceptsUtterance } from "@/lib/session";

export const maxDuration = 60;

/** 1発話の上限（ブラウザ側の切り出しは最大60秒）。16kHz mono 16bit + ヘッダ */
const MAX_WAV_BYTES = 44 + 16000 * 2 * 65;

const Query = z.object({
  seq: z.coerce.number().int().positive().max(100_000),
  durationMs: z.coerce.number().int().nonnegative().max(120_000).catch(0),
});

const isWav = (b: Buffer) =>
  b.length > 44 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WAVE";

/** 発話1つ分の WAV を受け取り、Azure で発音評価して保存する（会話と並行して呼ばれる） */
export const POST = handler<{ id: string }>(async (req, params) => {
  const sessionId = parseId(params.id);
  if (!sessionId) return jsonError(404, "not_found");
  const query = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!query.success) return jsonError(400, "invalid seq");
  if (Number(req.headers.get("content-length") ?? 0) > MAX_WAV_BYTES) return jsonError(413, "too_large");

  // 存在しない・終了した・時間制限を過ぎたセッションには保存しない（評価の費用もかけない）
  const state = await acceptsUtterance(sessionId);
  if (state === "not_found") return jsonError(404, "not_found");
  if (state === "closed") return jsonError(409, "session_closed");

  const wav = Buffer.from(await req.arrayBuffer());
  if (wav.length > MAX_WAV_BYTES) return jsonError(413, "too_large");
  if (!isWav(wav)) return jsonError(400, "invalid_wav");

  const assessment = azureConfigured()
    ? await assessPronunciation(wav).catch((e) => {
        console.error("azure assessment failed", e);
        return null;
      })
    : null;

  const values = { sessionId, ...query.data, ...(assessment ?? EMPTY_ASSESSMENT) };
  await db()
    .insert(t.utterances)
    .values(values)
    .onConflictDoUpdate({ target: [t.utterances.sessionId, t.utterances.seq], set: values });

  return NextResponse.json({ ok: true, assessed: Boolean(assessment) });
});
