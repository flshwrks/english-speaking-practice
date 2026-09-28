# 会話後分析の精度向上（指標・CEFR・プロンプト・再実行の安全性）

## 対象
- src/lib/analysis.ts（入力の組み立て / AI 呼び出し / 後処理 / 保存の4段に分割）
- src/lib/metrics.ts（新規: 指標の純粋関数）
- src/lib/azure.ts（語の時刻 offsetMs・durationMs を保存）
- src/lib/format.ts（isWeakWord から Monotone と機能語の弱化を除外）
- src/db/schema.ts（SessionMetrics に任意項目、WordAssessment に時刻、sessions.homework 列）
- scripts/analysis-dryrun.ts（新規: DB に書かずに分析を試す）、scripts/metrics-test.ts（新規: 単体テスト）

## 変更内容
- 話速は会話モードによらず Azure の語の時刻と聞き取った語（つなぎ語・繰り返しを除く）で計算。調音速度・ポーズ・平均連続語数・応答までの時間を追加
- 語彙の多様性を MATTR（窓50語）に、Azure スコアの平均を語数の重み付きに
- 誤り率は分析 AI が発話ごとに漏れなく数えた誤りから（指導項目の数ではなく）。誤りのない節の割合を追加
- CEFR は AI の判定を実測の目安から ±1 段階に収め、表示は直近5回の中央値
- 難易度は adaptivity.ts の decideLevel、ミスの型は error-patterns.ts のカタログから
- 前回の最重要ポイント（宿題）を生かせたかを判定して sessions.homework に保存
- AI の声を拾っただけの発話を検出して除外。重複・無意味な指摘を後処理で除去
- 再分析しても指摘・ミスの型の回数が二重にならない保存処理
- 分析はストリーミング＋上限 32000 トークン、effort low

## 理由
- 手動モードと自動モードで発話時間の定義が違い、話速の変化がモードの切り替えで生じていた
- Monotone がほぼ全語に付き、弱い語の枠を埋めて音素の誤りが埋もれていた
- 誤り率が「AI が選んだ指導項目の数」になっていて学習者の正確さを測れていなかった

## 残作業
- `npm run db:push`（sessions.homework 列）
- 古い会話の指標は旧定義のまま（再計算するなら別途バックフィル）
