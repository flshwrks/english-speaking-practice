/**
 * 自分専用のためのシンプルな認証。
 * APP_PASSWORD でログインし、AUTH_SECRET で HMAC 署名した Cookie を発行する。
 * proxy（Edge/Node 両対応）でも使えるよう Web Crypto のみを使う。
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
    ["sign"],
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
  return sig === (await hmac(exp));
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE_SEC,
};
