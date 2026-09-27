# 2026-09-27 UI v3: 画面構成からの作り直し

## 対象
- 画面を `src/app/(app)/` ルートグループへ移動（URL は同じ）。ログイン画面はシェルの外
- src/app/(app)/layout.tsx（新規）, src/components/shell-status.tsx（新規）, src/lib/typeset.ts（新規）
- src/app/globals.css, src/app/layout.tsx, src/app/manifest.ts, public/icon*.png|svg, src/app/apple-icon.png
- src/components/{app-shell,ui,expression-card,speak-button,trend-chart,form-controls,illustrations}.tsx
- 全画面: (app)/page.tsx, session/new/{page,live-session}.tsx, session/[id]/{page,client}.tsx, progress, curriculum, expressions, profile, login, not-found, error
- src/lib/stats.ts（使わなくなった greeting / todayLabel を削除）

## 変更内容
- 殻: PC は左サイドバー（ナビ・今週の12週トラック・API 費用）、スマホは下タブ4つ（上部バー廃止）。準備・会話中はナビなし
- ホーム: 「今日のレッスン」パネルを主役に（シナリオ＋今日の5表現＋開始ボタン）。挨拶・数字タイル・番号付きセクションを廃止
- 準備: PC は左に説明と開始操作、右に表現を辞書の項目のように（例文中の見出し語に下線）。説明の3ステップを廃止
- 会話中: 下部ドックが番に応じて切り替わる（相手の番はボタンを出さない）。PC は右に今日の表現、スマホはシート。交代方法は「…」メニューへ
- フィードバック: 要約→スコア（目標80の計器・前回比較）→要点→添削（語単位の差分で赤ペン風）→表現。会話全文と発音の詳細は折りたたみ（長さ約1/3）
- 記録: 3指標を1枚のグラフに（線種＋線端ラベル）、ミスの型は表に
- カリキュラム: 12週トラック＋今週の展開パネル＋各週は1行の開閉式
- 表現: カードをやめて3列の一覧（見出し語と意味／例文／操作）、追加はポップオーバー
- 設定: 左に項目名・右に入力の設定画面型。難易度は10段のボタン
- 書体を IBM Plex Sans JP（UI・和文）＋ Source Serif 4（英語の例文のみ）に。灰色文字のコントラストを 5:1 以上に。主ボタンは墨色、朱色は「あなたの番」「添削の印」「今週」だけ

## 理由
- 「表面の色ではなく、画面の使い方・配置・形が AI 製に見える」というフィードバック。別エージェント（上位モデル）の批評も踏まえ、画面ごとの役割と情報の優先順位から設計し直した
