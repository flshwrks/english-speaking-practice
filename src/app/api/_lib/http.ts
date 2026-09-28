/** ルートハンドラ共通: 認証・入力検証・エラー応答の形（{ error: string } とステータス）をそろえる */
import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { AUTH_COOKIE, verifyToken } from "@/lib/auth";

export const jsonError = (status: number, error: string) => NextResponse.json({ error }, { status });

/**
 * 認証を確かめてから処理する。proxy でも弾いているが、matcher の変更で素通りしないようルートでも確かめる。
 * 想定外の例外は 500 の JSON で返す（HTML のエラーページを返さない）
 */
export function handler<P>(fn: (req: NextRequest, params: P) => Promise<Response>) {
  return async (req: NextRequest, ctx: { params: Promise<P> }) => {
    if (!(await verifyToken(req.cookies.get(AUTH_COOKIE)?.value))) return jsonError(401, "unauthorized");
    try {
      return await fn(req, await ctx.params);
    } catch (e) {
      console.error(req.nextUrl.pathname, e);
      return jsonError(500, e instanceof Error ? e.message : String(e));
    }
  };
}

/** JSON 本文を検証する。不正なら 400 の応答を返す */
export async function parseBody<T extends z.ZodType>(req: Request, schema: T) {
  const body = await req.json().catch(() => undefined);
  const r = schema.safeParse(body);
  return r.success
    ? { data: r.data as z.infer<T> }
    : {
        error: jsonError(
          400,
          `invalid body: ${r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
        ),
      };
}

/** URL の [id] を正の整数として読む */
export function parseId(id: string) {
  const n = Number(id);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
