# FB の言い換え提案・表現の追加と、示唆のある会話（リキャスト）

## 対象
- `src/lib/analysis.ts`, `src/db/schema.ts`（feedback_items.key_expression）, `src/lib/expressions.ts`, `src/app/actions.ts`
- `src/app/session/[id]/page.tsx`, `src/app/expressions/page.tsx`, `src/components/ui.tsx`, `src/app/profile/page.tsx`
- `src/lib/lesson.ts`（会話 AI の指示）

## 変更内容
- 分析: 誤り以外に「より良い言い方」（重大度1の言い換え提案）を各発話で出す。各指摘に再利用できる「覚える表現」（コロケーション・句動詞・文の型）を付け、単純な文法の直しには付けない。提案表現は種類付きで最大6つ
- ミスの型の集計は重大度2以上だけにした（言い換え提案で「よくあるミス」が埋まらないように）
- FB 画面: 覚える表現に「＋追加」ボタン（追加済み表示つき）。言い換え提案は取り消し線にせず「より良い言い方」と表示
- 表現リスト画面に手入力で追加するフォーム。自分で追加した表現（seed 以外）は優先して出題
- 会話 AI: 面接ではなく双方向の会話に。2〜3回に1回、学習者の発言を自然な英語で受け止め直す（リキャスト）、自分の見方を言い回しの手本として添える、言葉を探していれば単語だけ差し出す。明示的な訂正・言い直しの要求は禁止

## 理由
- FB でより適切な言い回しや単語に触れ、それを覚えるリストに入れたい／会話が一方的で途中で気づける示唆が少ない、というユーザー要望

## 検証
- 誤りを含むテスト音声で、AI が "So, you're saying Japanese companies are strong in manufacturing, but..." と言い直して返すことを確認
- 分析で「manufacturing capabilities」「build an ecosystem」「expand overseas」などの言い換えと覚える表現が出て、「＋追加」で出題待ちに入ることを確認
