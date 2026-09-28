# 2026-09-29 お題カード・自分として話す場面・話題の重複よけ・再挑戦

## 対象
- src/lib/cards.ts（新規）, src/components/scenario-card.tsx（新規）
- src/db/schema.ts（scenario_cards テーブル、sessions.card_id。db:push 済み）
- src/lib/scenarios.ts（mode: roleplay / self、noCard、学生向け5シナリオ、レベル診断の役を学生向けに）, src/lib/syllabus.ts（新シナリオを各週に）
- src/lib/conversation-prompt.ts（カードと場面の決まり）, src/lib/session.ts / use-realtime-session.ts（開始時に cardId）
- src/lib/analysis.ts（カードのゴールに照らした講評）, src/lib/config.ts（カード用モデル）
- 画面: session/new/{page,live-session}.tsx, (app)/page.tsx, session/[id]/page.tsx, actions.ts（別のお題にする）

## 変更内容
- お題カード: 会話ごとに「状況・あなたの役・使える事実・ゴール」を Haiku 4.5 で生成（約6〜10秒、1枚 約0.5円）。ビジネスの場面は若手の役と数字入りの事実を渡し、学生が職歴を作り話しなくてよいように。会話 AI も同じカードを見る（カードを読み上げず、必要なときに事実を出す）
- 自分として話す場面: 外資系インターン面接・ケース面接・英語ディスカッション・研究の説明・海外で働く先輩に話を聞く。役職を聞かない決まりを会話 AI に
- 話題の重複よけ: 直近のカードの話題タグを生成時に渡し、業界・国・切り口を変える
- 再挑戦: FB から「同じお題に再挑戦」、ホームで12〜45日前のお題を提案。再挑戦の FB に「前回との比較」（話す速さ・誤りのない節・話し始めるまで・発音・流暢さ・抑揚）
- ホームを開いたときにおすすめのカードを先に作る（準備画面を待たせない）

## 理由
- 学生なのでビジネスの場面で話せる材料がなく、役職を想像で答えることになり、毎回同じ話題で成長の実感がないというフィードバック

## 検証
- カード生成の品質を3シナリオで確認。E2E でカードつき会話→同じカードで再挑戦→比較の表示まで確認し、DB はスナップショットから復元
- 型チェック・lint・単体テスト42件・本番ビルド
