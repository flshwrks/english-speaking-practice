# 初期実装（Phase 1〜4 一式）

## 対象
- `src/db/schema.ts`, `src/db/index.ts`, `drizzle.config.ts`
- `src/lib/`（config, auth, scenarios, lesson, azure, analysis, client/recorder, client/audio-store, client/use-realtime-session）
- `src/app/`（ホーム, login, session/new, session/[id], expressions, progress, profile, manifest, api/session/*）
- `src/components/`（ui, speak-button, expression-card, trend-chart）
- `src/proxy.ts`, `next.config.ts`
- `scripts/`（seed, review-export, review-import）, `data/expressions.json`
- `.claude/skills/weekly-review/SKILL.md`, `README.md`, `CLAUDE.md`, `.env.example`, `docs/MASTER_PLAN.md`

## 変更内容
- OpenAI `gpt-realtime-mini` との WebRTC 会話。サーバーで一時トークンを発行し、キーはブラウザに渡さない
- 自分の発話を VAD イベントに合わせて 16kHz WAV で切り出し、会話と並行して Azure で発音・韻律を評価（Speech SDK の台本なし評価）
- 会話後に Claude（`claude-sonnet-5`, 構造化出力）で文法・コロケーション・自然さ・丁寧さ・発音・抑揚を分析し、ミスの型・表現の習得状態・難易度を更新
- 「今日の表現」: 毎回3つ（新規2＋復習1）を提示し、AI が使う場面を作り、会話後に使用を判定。簡易的な間隔反復
- 週次レビューは Claude Code のスキルで手動実行（export → 対話 → import）
- コストメーターと月予算の上限、セッション時間の上限
- パスワード＋署名付き Cookie の簡易認証（proxy.ts）

## 理由
- マスタープランの Phase 1〜4 を一括で実装するため
- 計画からの変更: 録音は Vercel Blob ではなく端末の IndexedDB に保存（Azure 用の WAV が大きく、Blob の無料枠に収まらないため）。日別の指標テーブルは作らず、セッション単位の `metrics` から集計

## 残作業
- Anthropic / Azure のキーを設定して実会話で検証（発音評価の精度、書き起こしの忠実さ、1分あたりの実コスト）
- 実際の FB を見て分析プロンプトを調整
- iOS Safari 実機確認、発音ドリル（台本あり評価）モード
- 一時 Neon DB（neon-new で作成、72時間で失効）を自分の Neon アカウントに引き取るか、Vercel Marketplace で本番用を作成

## /simplify による見直し（同日）
- カテゴリ・状態・レジスターの定義を `src/lib/categories.ts` と `LEARNING_STATUSES` に集約（型・zod・ラベルを1か所から導出）
- 表現の出題と状態遷移を `src/lib/expressions.ts`、セッションの開始・終了・再分析を `src/lib/session.ts` に移し、ルートとページは呼ぶだけにした
- 今日の表現はページ表示時に1回だけ選び、その ID を開始 API に渡す（2回選んで食い違う問題を解消）
- 分析結果の保存を1トランザクション（`db.batch`）にまとめ、途中失敗時の半端な反映と再分析時の二重計上を防止
- 終了時の文字起こし反映を1クエリに、読み取りを並列化、表現一覧は必要な行だけ取得
- コスト計算（`sessionCostUsd`）・円換算・日付表示（JST）・弱い語の判定を共通化
- 未使用の列（times_shown, times_correct, last_session_id）と未使用の state・props を削除
- IndexedDB 接続と HMAC 鍵を使い回す
- 見送り: 分析待ちのポーリング専用 API（1人利用で負荷が小さい）、会話中の文字起こし描画の最適化、DB インデックス（データ量が小さい）、スクリプト間の起動処理の共通化
