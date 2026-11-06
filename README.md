# Speaking Practice

ビジネス英語のスピーキングを、AI とのリアルタイム会話で鍛える自分専用の Web アプリ。
会話後に文法・コロケーション・自然さ・発音・抑揚のフィードバックを返し、苦手や成長を記録して、次の練習に反映する。

## 作りの要点

自分の英語学習のために作ったアプリで、使いながら改修している。モデルは役割で使い分けた。会話は遅延の小さい OpenAI Realtime、発音の採点は Azure の音素評価、会話後の添削と分析は Claude が受け持つ。

- **分析結果は構造化出力で受け取る**。Claude には zod のスキーマで出力の形を指定する。想定外の値が返っても、分析全体は止まらないようにした（`src/lib/analysis.ts`）
- **学習者モデルを毎回引き継ぐ**。強み・弱点・苦手な音を DB に持ち、分析のたびに背景知識として渡して、同じ呼び出しで更新版を返させる。回を重ねるほど、FB が本人の癖に合ってくる
- **数値は LLM に決めさせない**。話速、語彙の多様さ（MATTR）、誤りのない節の割合はコードで計算する。発音の指摘は Azure の音素データで裏付けられるものに限り、CEFR の推定も実測値から±1段の範囲に収める
- **学習ループ**。間隔反復（SRS）、36種類のミスの型と減衰つきの優先度、EMA とヒステリシスによる難易度の自動調整
- **費用と通信断への備え**。1回ごとの実費を記録し、月の予算を超えたら開始前に確認を出す。会話は途中保存と再送で、接続が切れても失わない
- **検証**。単体テスト（`npm test`）に加え、過去の実セッションを新しい分析ロジックで再実行するスクリプトを用意した

開発には Claude Code を使った。大きな改修では、分析・学習アルゴリズム・会話・UI・批評などに役割を分けた複数のエージェントを並行で動かした（記録は `improvement_list/`）。

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
