import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let _db: NeonHttpDatabase<typeof schema> | undefined;

/** ビルド時に DATABASE_URL が無くても落ちないよう、初回アクセス時に接続する */
export function db() {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL が設定されていません");
    _db = drizzle(neon(url), { schema });
  }
  return _db;
}

export * as t from "./schema";
