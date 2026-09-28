/**
 * 自分専用のためのシンプルな認証。
 * APP_PASSWORD でログインし、AUTH_SECRET で HMAC 署名した Cookie を発行する。
 * proxy（Edge/Node 両対応）でも使えるよう Web Crypto のみを使う（DB は総当たり対策の関数の中でだけ読み込む）。
 */
export const AUTH_COOKIE = "esp_auth";
const MAX_AGE_SEC = 60 * 60 * 24 * 30;

let keyPromise: Promise<CryptoKey> | undefined;

function hmacKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET が設定されていません");
  keyPromise ??= crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return keyPromise;
}

async function hmac(data: string) {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function createToken() {
  const exp = String(Math.floor(Date.now() / 1000) + MAX_AGE_SEC);
  return `${exp}.${await hmac(exp)}`;
}

export async function verifyToken(token: string | undefined) {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  try {
    // 署名の比較は verify で行う（文字列比較は一致した長さで時間が変わる）
    const bytes = Uint8Array.from(atob(sig.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    return await crypto.subtle.verify("HMAC", await hmacKey(), bytes, new TextEncoder().encode(exp));
  } catch {
    return false;
  }
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE_SEC,
};

/** 総当たり対策: 直近 LOGIN_WINDOW_MIN 分に LOGIN_MAX_FAILURES 回失敗したら、しばらく受け付けない */
const LOGIN_WINDOW_MIN = 15;
const LOGIN_MAX_FAILURES = 5;
const FAILURE_DELAY_MS = 1000;

/**
 * ログインの試行。ロック中は照合せずに "locked"。失敗は記録して1秒待たせ、成功したら失敗の記録を消す。
 * パスワードは HMAC どうしで比べる（長さや一致位置で時間が変わらないように）
 */
export async function attemptLogin(password: string): Promise<"ok" | "wrong" | "locked"> {
  const [{ db, t }, { count, gte, lt, sql }] = await Promise.all([import("@/db"), import("drizzle-orm")]);
  const recent = sql`now() - make_interval(mins => ${LOGIN_WINDOW_MIN})`;
  const [{ n }] = await db().select({ n: count() }).from(t.loginFailures).where(gte(t.loginFailures.at, recent));
  if (n >= LOGIN_MAX_FAILURES) return "locked";

  const expected = process.env.APP_PASSWORD;
  if (expected && (await hmac(password)) === (await hmac(expected))) {
    await db().delete(t.loginFailures);
    return "ok";
  }
  await Promise.all([
    db().insert(t.loginFailures).values({}),
    db()
      .delete(t.loginFailures)
      .where(lt(t.loginFailures.at, sql`now() - interval '1 day'`)),
    new Promise((ok) => setTimeout(ok, FAILURE_DELAY_MS)),
  ]);
  return "wrong";
}
