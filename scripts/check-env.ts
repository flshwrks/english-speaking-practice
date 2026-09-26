/**
 * .env.local の設定が正しく動くかを確認する（どれも課金されない呼び出しだけを使う）。
 * 使い方: npm run check
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import Anthropic from "@anthropic-ai/sdk";
import { count } from "drizzle-orm";
import { db, t } from "@/db";
import { PRICING } from "@/lib/config";

type Result = { name: string; ok: boolean | null; detail: string };

async function check(name: string, fn: () => Promise<string>): Promise<Result> {
  try {
    return { name, ok: true, detail: await fn() };
  } catch (e) {
    return { name, ok: false, detail: e instanceof Error ? e.message.split("\n")[0].slice(0, 160) : String(e) };
  }
}

const need = (key: string) => {
  const v = process.env[key]?.trim();
  if (!v) throw new Error(`${key} が空です`);
  return v;
};

async function main() {
  const results = await Promise.all([
    check("ログイン設定 (APP_PASSWORD / AUTH_SECRET)", async () => {
      need("APP_PASSWORD");
      need("AUTH_SECRET");
      return "設定済み";
    }),
    check("DB (DATABASE_URL)", async () => {
      need("DATABASE_URL");
      const [{ n }] = await db().select({ n: count() }).from(t.expressions);
      if (n === 0) throw new Error("表が空です。npm run db:push && npm run db:seed を実行してください");
      return `接続OK（表現 ${n} 件）`;
    }),
    check("OpenAI (OPENAI_API_KEY)", async () => {
      const res = await fetch(`https://api.openai.com/v1/models/${PRICING.realtime.model}`, {
        headers: { Authorization: `Bearer ${need("OPENAI_API_KEY")}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
      return `${PRICING.realtime.model} を利用可能`;
    }),
    check("Anthropic (ANTHROPIC_API_KEY)", async () => {
      need("ANTHROPIC_API_KEY");
      const m = await new Anthropic().models.retrieve(PRICING.claude.model);
      return `${m.id} を利用可能（残高はコンソールで確認）`;
    }),
    (async (): Promise<Result> => {
      const name = "Azure Speech (AZURE_SPEECH_KEY / REGION)";
      if (!process.env.AZURE_SPEECH_KEY?.trim()) {
        return { name, ok: null, detail: "未設定（発音評価なしで動作します）" };
      }
      return check(name, async () => {
        const region = need("AZURE_SPEECH_REGION");
        const res = await fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
          method: "POST",
          headers: { "Ocp-Apim-Subscription-Key": need("AZURE_SPEECH_KEY"), "Content-Length": "0" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}（キーとリージョンの組み合わせを確認）`);
        return `リージョン ${region} で認証OK`;
      });
    })(),
  ]);

  for (const r of results) console.log(`${r.ok === null ? "⚪" : r.ok ? "✅" : "❌"} ${r.name}: ${r.detail}`);
  if (results.some((r) => r.ok === false)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
