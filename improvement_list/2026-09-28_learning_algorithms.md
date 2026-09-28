# 学習ループのアルゴリズム刷新（間隔反復・出題・ミスの型・難易度・おすすめ）

## 対象
- src/lib/srs.ts（新規）, src/lib/expressions.ts, src/db/schema.ts（expressions に ease/reps/lapses/misses/last_practiced_at）
- src/lib/adaptivity.ts（新規）, src/lib/weakness.ts（新規）, src/lib/error-patterns.ts（新規）
- src/lib/lesson.ts, src/lib/scenarios.ts, src/lib/stats.ts
- scripts/review-export.ts, scripts/review-import.ts, scripts/migrate-error-patterns.ts（新規）, .claude/skills/weekly-review/SKILL.md, data/vocabulary.json
- テスト: src/lib/{srs,adaptivity,weakness,stats}.test.ts（`npx tsx --test src/lib/*.test.ts`）

## 変更内容
- 間隔反復を SM-2 変形に（安定度・ease・lapse・未使用のバックオフ・leech・ドリル・習得条件・±15% の決定的 fuzz・JST 日単位）
- 出題を合計5枠に固定し、期限の件数に応じて復習を増やし新規を絞る。復習は想起確率の低い順。新規はカテゴリを交互に
- ミスの型を固定カタログに寄せ、減衰つき優先度と active/improving/resolved/reopened の状態を毎回計算
- 難易度は余裕度の EMA＋2回連続のヒステリシスで ±1。難易度1段ごとに話し方・速度が変わるように
- おすすめのシナリオを日替わり・直前回避・苦手カテゴリ優先に。予算の月区切りを JST に。週次レビューの取り込みを1トランザクション・二重取り込み防止に

## 理由
- 旧方式は新規4/回に対し復習1/回で、未使用の表現が翌日に戻り続け、積み残しが際限なく増えた（シミュレーションで90日後に期限切れ約270件）
- 習得が「自発的に使えた1回」頼みでほぼ到達不能、レベルは1回ごとの AI 判定でランダムウォークしていた

## 残作業
- db:push（expressions の5列）と scripts/migrate-error-patterns.ts の実行
- ホームで scenarioMenu に直近のシナリオと weakExpressionCategories() を渡す（UI 担当）
