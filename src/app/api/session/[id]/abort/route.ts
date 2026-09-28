import { NextResponse } from "next/server";
import { abortSession } from "@/lib/session";
import { handler, jsonError, parseId } from "@/app/api/_lib/http";

/** 接続できずに始まらなかったセッションを消す（記録が残っていれば消さない） */
export const POST = handler<{ id: string }>(async (_req, params) => {
  const id = parseId(params.id);
  if (!id) return jsonError(404, "not_found");
  return NextResponse.json({ ok: true, deleted: await abortSession(id) });
});
