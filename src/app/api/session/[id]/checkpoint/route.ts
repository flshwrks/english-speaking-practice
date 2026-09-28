import { NextResponse } from "next/server";
import { checkpointSession, EndInput } from "@/lib/session";
import { handler, jsonError, parseBody, parseId } from "@/app/api/_lib/http";

/** 会話の途中保存（応答ごと・タブが隠れたとき）。終了済みなら何もしない */
export const POST = handler<{ id: string }>(async (req, params) => {
  const id = parseId(params.id);
  if (!id) return jsonError(404, "not_found");
  const body = await parseBody(req, EndInput);
  if (body.error) return body.error;
  const result = await checkpointSession(id, body.data);
  if (result === "not_found") return jsonError(404, "not_found");
  return NextResponse.json({ ok: true, alreadyEnded: result === "already_ended" });
});
