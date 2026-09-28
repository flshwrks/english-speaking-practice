# 言い直し練習（retry drill）

## 対象
- src/db/schema.ts（drill_attempts テーブル、DrillScores / DrillWord 型を追加）
- src/lib/azure-scripted.ts（新規）
- src/lib/drill.ts（新規）
- src/app/api/drill/[itemId]/route.ts（新規）
- src/components/retry-drill.tsx（新規）
- src/app/(app)/session/[id]/drill/page.tsx, client.tsx（新規）

## 変更内容
- 添削の改善後の文を声に出して、Azure の台本あり評価（miscue・prosody 付き）で採点する機能を追加
- 脱落・言い足しは、聞き取れた語とお手本の語の最長共通部分列で判定（連続認識で区間ごとに脱落が重複するのを避ける）
- 得点は「言えなかった語を0点とした語ごとの平均」。80点以上でクリア。初クリア時は覚える表現の復習間隔を伸ばす（recordDrillSuccess）
- 言い直し練習ページ: 答えを隠し、元の発言と解説を手がかりに思い出して言う → 採点後にお手本を表示 → 最後にまとめ
- 会話中の自分の録音（端末内）と今回の録音を聞き比べられる
- 費用は元のセッションの costUsd / usage.azureSeconds に加算。1回15秒まで、同じ添削は10分に10回まで

## 理由
- 気づき（添削を読む）から、正しく言える（産出）までをその場でつなぐため。読むだけより思い出して言うほうが定着する

## 残作業
- `npm run db:push`（drill_attempts の作成）
- フィードバック画面への組み込み（各添削の「言い直す」と「言い直し練習」への入口）
