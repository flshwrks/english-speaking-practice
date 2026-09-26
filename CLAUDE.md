@AGENTS.md

# プロジェクトメモ

- 自分専用の英語スピーキング練習アプリ。設計は `docs/MASTER_PLAN.md`、セットアップは `README.md`
- Next.js 16（App Router, proxy.ts）。コードを書く前に `node_modules/next/dist/docs/` を確認する
- DB スキーマは `src/db/schema.ts`。変更したら `npm run db:push`
- 静的生成させたくないページは `await connection()` を使う（`DATABASE_URL` がないビルドで落ちるため）
- 検証: `npm run typecheck && npm run lint && npm run build`
- 週次レビューは `/weekly-review` スキル（`.claude/skills/weekly-review/`）
- 会話中の AI は訂正しない方針。FB はすべて会話後（`src/lib/analysis.ts`）
- 料金の単価は `src/lib/config.ts` の `PRICING`。モデルを変えたら単価も更新する
- 本番: https://english-speaking-practice-neon.vercel.app （Vercel: flshwrks-projects/english-speaking-practice、GitHub: flshwrks/english-speaking-practice の master に push で自動デプロイ）。関数リージョンは DB（Neon, シンガポール）に合わせて `sin1`
- 環境変数を変えたら `vercel env add <NAME> production --force` → 再デプロイ
