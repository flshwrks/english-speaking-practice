---
name: weekly-review
description: 英語スピーキング練習アプリの週次レビュー。直近1週間の練習データを書き出して振り返り、ユーザーと対話して、翌週のカリキュラムと「今日の表現」用の表現セットを DB に書き込む。「週次レビュー」「weekly review」「来週のカリキュラム」と言われたら使う。
---

# 週次レビュー

目的: 1週間の練習データから弱点と伸びを読み取り、**ユーザーの実際の予定や関心**に合わせた翌週のカリキュラムを作る。API ではなくここ（Claude Code）で行うので、費用はかからず、対話しながら決められる。

## 手順

### 1. データを書き出して読む
```bash
npm run review:export          # 直近7日。期間を変えるなら -- --days 14
```
出力された `reviews/<date>-export.md` を読む。

### 2. 振り返りを書く（日本語、簡潔に）
次の観点でまとめ、ユーザーに提示する。
- 伸びた点: 指標（発音・流暢さ・抑揚・WPM・誤り率）の変化、使えるようになった表現
- 繰り返しているミスの型: 上位2〜3個。具体例を1つずつ添える
- 今日の表現の定着度: 使えた率、使いこなせていない表現の傾向
- 練習量と費用: セッション数、時間、費用が月予算（既定3,000円）のペースに収まっているか

データが少ない（セッション0〜1件）場合は、そう伝えた上で、プロフィールと次の目標を中心に話す。

### 3. ユーザーと対話する（2〜4往復）
一度に1問ずつ聞く。例:
- 今週いちばん話しにくかった場面は？
- 来週、英語を使う予定（面接、留学生との交流、授業の発表など）はある？
- 難易度（現在 N/10）は、きつい・ちょうどいい・物足りない のどれ？
- 重点を置きたいのは、表現の幅・発音・とっさの反応 のどれ？

### 4. 翌週の計画を JSON にする
`reviews/<date>-plan.json` に次の形式で書く。

```json
{
  "weekStart": "YYYY-MM-DD（翌週の月曜）",
  "theme": "今週のテーマ（日本語, 短く）",
  "focus": "重点。会話 AI のプロンプトにも入るので英語で1〜2文（例: Practice structuring answers with a clear conclusion first, and softening disagreement.）",
  "scenarioIds": ["pushback", "negotiate"],
  "categories": ["agreeing_disagreeing", "negotiating"],
  "summary": "振り返りの要約（日本語, 3〜5文）",
  "userComment": "対話で聞いたユーザーの声の要約",
  "expressions": [
    {
      "text": "英語表現（空所は ___）",
      "meaning": "日本語の意味",
      "example": "例文",
      "scene": "使う場面（日本語）",
      "category": "meetings | agreeing_disagreeing | hedging | clarifying | negotiating | reporting | small_talk | presenting | feedback | その他の snake_case",
      "register": "casual | neutral | formal"
    }
  ],
  "resolvePatterns": ["直近2週間出ていない・克服したミスの型の key"],
  "level": 7,
  "profile": { "interests": "更新があれば" }
}
```

表現の選び方:
- 新規10件前後。1日2件出題されるので、1週間で使い切る量
- テーマと弱点に直結するもの。すでに `queued` が多いカテゴリは控えめにする
- ネイティブがビジネスで本当に使う、汎用性の高い言い回し。教科書的すぎる・古い表現は避ける
- 繰り返しているミスの「正しい言い方」を表現として入れるのも有効

`level` は、ユーザーの体感と指標を見て変えるときだけ入れる。`profile` も更新があるときだけ入れる。

### 5. 取り込む
```bash
npm run review:import -- reviews/<date>-plan.json
```
成功したら、翌週のテーマと追加した表現数をユーザーに伝えて終わる。
