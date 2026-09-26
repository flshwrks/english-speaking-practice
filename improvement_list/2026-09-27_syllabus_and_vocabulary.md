# 全体カリキュラム（12週）と単語・熟語の出題

## 対象
- `src/lib/syllabus.ts`（新規）, `src/app/curriculum/page.tsx`（新規）, `data/vocabulary.json`（新規）
- `src/db/schema.ts`（expressions.kind, profile.program_start）, `src/lib/categories.ts`, `src/lib/lesson.ts`, `src/lib/expressions.ts`
- `src/app/page.tsx`, `src/app/session/new/*`, `src/components/expression-card.tsx`, `src/lib/scenarios.ts`
- `scripts/seed.ts`, `scripts/review-export.ts`, `scripts/review-import.ts`, `.claude/skills/weekly-review/SKILL.md`, `docs/MASTER_PLAN.md`

## 変更内容
- 12週で1周する全体カリキュラムを追加し、開始日（profile.program_start）からの経過週で自動的に進むようにした。curriculum テーブルは「その週だけの上書き」に役割を変更
- 週次レビューの取り込み形式を、上書き（override）・同じ週の繰り返し（repeatWeek）・表現の追加だけにした
- 今日の表現を「フレーズ2＋単語・熟語2＋復習1」に変更。単語・熟語100件を追加し、会話 AI にはフレーズと単語を分けて渡す
- カリキュラム一覧ページを追加し、ホームに「Week N / 12」を表示

## 理由
- 毎週 Claude にカリキュラムを推論させるのではなく、骨格を先に決めて応用する方が安定し、手間も少ないため（ユーザー要望）
- 文単位の表現だけでなく、単語・熟語も増やしたいという要望に対応するため

## /simplify による見直し（同日）
- 週の内容を決める処理を `resolveWeek`（lesson.ts）の1か所に集約。ホーム・カリキュラム一覧・セッション開始・週次レビューの書き出しはすべてこれを使う（書き出しの「来週」も上書きを反映）
- 上書き（curriculum テーブル）の列を null 許容にし、「指定した項目だけ差し替え、null は全体カリキュラムのまま」に統一
- 「同じ週を繰り返す」を開始日の書き換えから `profile.week_offset` の加算に変更（開始日の意味を保ち、繰り返した週数を表示できる）
- 週次レビューで追加した表現の優先を、上書き行への紐付け（curriculum_id, 削除）ではなく「今週追加された review 由来」で判定
- プロフィールの二重取得をやめ、`getCurrentCurriculum()` がプロフィールも返す形に
- 表現の種類のラベル・AI への見出しを categories.ts に集約、共通 Badge、DAY_MS を format.ts に統一
- 見送り: 今日の表現の取得を3クエリ→2クエリにまとめる（並列実行で遅延への影響がほぼないため）
