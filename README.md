# Speaking Practice

ビジネス英語のスピーキングを、AI とのリアルタイム会話で鍛える自分専用の Web アプリ。
会話後に文法・コロケーション・自然さ・発音・抑揚のフィードバックを返し、苦手や成長を記録して、次の練習に反映する。

全体の設計は [docs/MASTER_PLAN.md](docs/MASTER_PLAN.md) を参照。

## しくみ

| 役割 | 使うもの |
|---|---|
| 会話 | OpenAI `gpt-realtime-mini`（ブラウザから WebRTC で直接接続） |
| 発音・抑揚の評価 | Azure AI Speech の発音評価（台本なし・prosody 付き）。発話ごとに会話と並行して評価 |
| 会話後の分析 | Claude `claude-sonnet-5`（構造化出力） |
| 週次レビュー | Claude Code で `/weekly-review`（API 費用なし） |
| DB | Neon Postgres（Drizzle ORM） |
| 録音の保存 | 端末の IndexedDB（30日で自動削除。サーバーには保存しない） |
| 認証 | 環境変数のパスワード＋署名付き Cookie |

## セットアップ

画面操作を含む詳しい手順は [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md) を参照。キーを入れたら `npm run check` で接続を確認できる。

1. 依存関係を入れる
   ```bash
   npm install
   ```
2. `.env.example` を `.env.local` にコピーして値を入れる
   - `DATABASE_URL`: Neon の接続文字列（Vercel の Storage / Marketplace から Neon を作ると自動で入る）
   - `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`
   - `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION`: 任意。未設定なら発音評価なしで動く。prosody 評価に対応するリージョン（例: `eastus`）で作る
   - `APP_PASSWORD` / `AUTH_SECRET`: ログイン用。`openssl rand -base64 32` などで作る
3. DB を作る
   ```bash
   npm run db:push   # テーブル作成
   npm run db:seed   # 表現集108件とプロフィールの初期値
   ```
4. 起動
   ```bash
   npm run dev
   ```

マイク付きイヤホンを使うこと。スピーカーだと AI の声をマイクが拾い、AI が自分の発話に反応してしまう。

## デプロイ（Vercel）

```bash
npm i -g vercel
vercel link
vercel env add ...   # .env.local と同じ値
vercel deploy --prod
```

`/session/[id]` と `/api/session/[id]/end` は分析のため最大300秒動く（Vercel の既定上限内）。

## 週次レビュー

Claude Code でこのフォルダを開き、`/weekly-review` を実行する。手順は [.claude/skills/weekly-review/SKILL.md](.claude/skills/weekly-review/SKILL.md)。

```bash
npm run review:export                         # reviews/<date>-export.md に直近1週間を書き出す
npm run review:import -- reviews/<date>-plan.json   # 翌週の計画を取り込む
```

## 費用の目安と上限

- 単価は `src/lib/config.ts` の `PRICING` にある（2026年9月時点の概算）
- セッションごとの実費をホーム画面で月合計として表示し、`MONTHLY_BUDGET_JPY` を超えると開始前に確認する
- 1回の会話は `SESSION_MAX_MINUTES`（既定15分）で自動終了する
