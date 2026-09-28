import { NextResponse } from "next/server";
import { EndInput, finishSession } from "@/lib/session";
import { handler, jsonError, parseBody, parseId } from "@/app/api/_lib/http";

export const maxDuration = 300;

/** 会話の終了。再送されても安全（終了済みなら alreadyEnded: true を返すだけ） */
export const POST = handler<{ id: string }>(async (req, params) => {
  const id = parseId(params.id);
  if (!id) return jsonError(404, "not_found");
  const body = await parseBody(req, EndInput);
  if (body.error) return body.error;
  const result = await finishSession(id, body.data);
  if (result === "not_found") return jsonError(404, "not_found");
  return NextResponse.json({ ok: true, alreadyEnded: result === "already_ended" });
});
