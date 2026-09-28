import { NextResponse } from "next/server";
import { startSession, StartInput } from "@/lib/session";
import { handler, jsonError, parseBody } from "@/app/api/_lib/http";

/** 開始時に締めた放置セッションの分析（after）もこの実行時間の中で走る */
export const maxDuration = 300;

export const POST = handler(async (req) => {
  const body = await parseBody(req, StartInput);
  if (body.error) return body.error;
  try {
    const result = await startSession(body.data);
    if (result.ok) return NextResponse.json(result);
    // 予算超過は 402（error: "budget" は「それでも始める」可、"budget_hard_cap" は不可）
    return jsonError(result.reason === "unknown_scenario" ? 400 : 402, result.reason);
  } catch (e) {
    // OpenAI の一時トークン発行の失敗など、外部サービスの失敗
    console.error("session start failed", e);
    return jsonError(502, e instanceof Error ? e.message : String(e));
  }
});
