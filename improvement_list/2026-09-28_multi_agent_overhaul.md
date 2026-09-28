# 2026-09-28 マルチエージェントによる全体改修（統合記録）

司令塔（メイン）＋6エージェント（A 分析・B 学習アルゴリズム・C 会話エンジン・D UI/UX・F 言い直し練習・E 批評）で実施。
各エリアの詳細は同日の個別ファイル（analysis_precision / learning_algorithms / retry_drill）を参照。

## 対象
- 分析: src/lib/{analysis,metrics,azure,format,typeset}.ts, scripts/{analysis-dryrun,metrics-test}.ts
- 学習ループ: src/lib/{srs,expressions,weakness,error-patterns,adaptivity,lesson,stats,scenarios}.ts, scripts/review-*.ts, scripts/migrate-error-patterns.ts, data/vocabulary.json, weekly-review スキル
- 会話: src/lib/client/{use-realtime-session,recorder,audio-store}.ts, src/lib/{session,conversation-prompt,config,auth,wav}.ts, src/app/api/**
- 新機能: src/lib/{drill,azure-scripted}.ts, src/app/api/drill/**, src/components/retry-drill.tsx, src/app/(app)/session/[id]/drill/**
- UI: src/app/(app)/**, src/components/**, globals.css, layout/manifest/login
- DB（db:push 済み）: expressions に ease/reps/lapses/misses/last_practiced_at、sessions に homework/homework_given/max_minutes/analysis_started_at、drill_attempts / login_failures テーブル

## 変更内容（要点）
- 分析: 入力構築→モデル呼び出し→確定→保存に分割（試し分析スクリプト）。話速は Azure の語の時刻で統一（speech/articulation rate）、MATTR、節ごとの誤り数からの誤り率・誤りのない節の割合、語数で重み付けした発音平均、CEFR は実測で±1段に収め直近5回の中央値、反応時間。発音の指摘は音素データ根拠に限定。前回の宿題の達成判定。再実行しても二重計上しない原子的な保存
- 学習: SRS を安定度＋易しさ方式に（未使用≠失敗、苦手の休止と復帰、習得条件、揺らぎ）。溜まり具合に応じた出題枠（復習0〜5＋新規）。ミスの型は36種類のカタログ＋減衰つき優先度＋自動の改善・解決・再発。難易度は複合スコアの EMA＋ヒステリシス（初回だけ±2）
- 会話: 終了時に最後の発話を取りこぼさない、途中保存（checkpoint / beacon）と /end の再送、放置セッションの後片付け、接続断の検知、iOS の音声開始、録音の補間ノイズ修正、ログイン試行制限、予算の上限（120%）、会話の長さ 5/10/15 分、AI への指示に学習者像・弱点・宿題を背景として追加、文字起こしのヒントから今日の表現を外す
- 新機能「言い直し練習」: 添削ごとに言い直して Azure（台本あり）で採点、答えを隠した1問ずつの練習ページ、会話中の声との聞き比べ、合格で SRS に反映
- UI: 会話中の表現はヒント表示（タップで英語）、聞き取りモード、終了の確認、考え中の表示、初回の案内、今日の宿題、FB の目次・宿題の結果・次の一歩、記録に反応時間と誤りのない節の割合、表現の苦手表示、ページ形の読み込み骨組み、iOS の入力ズーム防止など
- 批評（E）の2巡目で見つかった不具合（難易度の急変、後片付け失敗で開始不可、言い換えの誤除外、宿題の食い違い、ログイン制限の競合 など）を修正

## 検証
- 型チェック・lint・単体テスト 42件・指標テスト、本番ビルド
- 実会話の E2E を2回（最後の発話の保存、反応時間、宿題、新指標、費用計上を確認）。テスト後は DB をスナップショットから復元
- 過去の実セッション #1・#16 を新しい分析で再分析（話速は語の時刻がないため未計測に）

## 残作業
- CEFR の境界値・難易度の閾値は暫定。実データが10回程度たまったら見直す
- 表現単位の言い直し練習（苦手な表現を直接練習）は未実装
