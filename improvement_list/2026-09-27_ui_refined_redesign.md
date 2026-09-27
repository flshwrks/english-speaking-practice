# 2026-09-27 UI を「紙とインク」の洗練デザインに刷新

## 対象
- src/app/globals.css, src/app/layout.tsx, src/app/manifest.ts
- src/components/{ui,illustrations,app-shell,expression-card,speak-button,trend-chart,form-controls}.tsx
- src/app/page.tsx, session/new/{page,live-session}.tsx, session/[id]/{page,client}.tsx
- src/app/{progress,curriculum,expressions,profile,login}/page.tsx, not-found.tsx, error.tsx
- src/lib/stats.ts（英語の挨拶・日付ラベル）
- public/icon.svg, icon-192.png, icon-512.png, src/app/apple-icon.png

## 変更内容
- ポップ（マスコット・グラデーション・紙吹雪・影）を廃止し、オフホワイト×墨色＋朱色1色の編集デザインへ
- 影→細い罫線、角丸は 8–12px、番号付きセクション（01, 02…）、数字は Instrument Serif、ラベルは Geist Mono
- フォント: Geist / Zen Kaku Gothic New / Instrument Serif / Geist Mono
- シナリオアイコンは線画の枠アイコンに、アプリアイコンもロゴマークに変更
- 未使用になった Mascot / Confetti / Blobs / Sparkle / ProgressRing を削除
- 機能・内容は変更なし

## 理由
- 前回のポップなデザインが「AIで作ったツール感が強い」とのフィードバックを受け、切れ味のある落ち着いたデザインにするため
