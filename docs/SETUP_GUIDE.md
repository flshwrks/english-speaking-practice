# セットアップ手順（初回だけ）

所要時間: 30〜40分。上から順に進めてください。各ステップの最後にある「確認」が通れば次へ進めます。

## 全体の流れ

| # | やること | 必須か | 期限 |
|---|---|---|---|
| 1 | Anthropic の API キーを用意する | 必須 | — |
| 2 | Azure で Speech リソースを作る | 任意（なくても会話と文法FBは動く） | — |
| 3 | `.env.local` にキーを書き込み、確認コマンドを実行 | 必須 | — |
| 4 | 本番用の DB を Vercel で作り、一時DBから切り替える | 必須 | 一時DBは 2026-09-29 夜ごろに消える |
| 5 | 起動して最初の会話をする | — | — |
| 6 | スマホで使えるようにする（Vercel にデプロイ） | 任意・後日でよい | — |

---

## 1. Anthropic の API キー

会話後のフィードバック分析に使います。**以前作ったキーがあれば、それで構いません。** ただし次の2点を確認してください。

- キーの文字列（`sk-ant-` で始まる）が手元に保存してあるか。キーは作成時に一度しか表示されません。見つからなければ新しく作ります
- 残高があるか。API は Claude Pro / Max のサブスクリプションとは**別の前払い制**です

### 手順
1. Claude Console（https://platform.claude.com ）にログインする。以前 console.anthropic.com で作ったアカウントも同じものです
2. 左メニューの **Billing（請求）** で残高（Credit balance）を確認する。$0 なら **Buy credits** から $5〜10 を追加する（このアプリだけなら月 $1〜3 程度の見込み）
3. 使いすぎ防止に、**Limits** で月の上限（Spend limit）を $5 程度に設定しておくと安心です
4. キーを新しく作る場合は、**API keys → Create key** を選ぶ。名前は `english-speaking-app` などにする
   - このアプリ専用のキーにしておくと、Usage 画面でこのアプリの費用だけを確認できます
5. 表示された `sk-ant-...` をコピーし、手順3で使うまでメモ帳などに一時保存する

---

## 2. Azure の Speech リソース（発音・抑揚の評価）

未設定のままでも、会話・文法や表現のFB・今日の表現はすべて動きます。発音と抑揚のスコアだけが出ません。後から追加しても構いません。

### 手順
1. https://portal.azure.com にログインする（Microsoft アカウント）
   - Azure を初めて使う場合は「無料アカウント」を作る。本人確認のためにクレジットカードの登録が必要ですが、無料枠の範囲なら請求されません
2. 上部の検索欄に「**Speech**」と入力し、「**Speech services**」（日本語表示なら「音声サービス」）を選ぶ
3. **＋作成** を押し、次のように入力する

   | 項目 | 入力する値 |
   |---|---|
   | サブスクリプション | 既定のもの |
   | リソースグループ | 「新規作成」→ `english-speaking` |
   | リージョン | **East US**（抑揚評価は英語(米国)のみ対応。East US なら確実） |
   | 名前 | 世界で一意の名前。例: `esp-speech-ondai` |
   | 価格レベル | まず **Free F0** を選ぶ（下の注意を参照） |

4. **確認および作成 → 作成** を押し、1〜2分待って **リソースに移動** を選ぶ
> **サインインで `AADSTS50020 ... does not exist in tenant 'Microsoft Services'` と出る場合**
> そのMicrosoftアカウントにまだ Azure の契約がないのが原因です。シークレットウィンドウで https://azure.microsoft.com/ja-jp/free/ を開き、「無料で始める」から登録を最後まで済ませてから、Portal を開き直してください。Gmail アドレスがまだMicrosoftアカウントになっていない場合は、サインイン画面の「作成」から同じアドレスで作ります。登録が途中で止まった場合は https://signup.azure.com で再開できます。

5. 左メニューの **キーとエンドポイント**（Keys and Endpoint）を開き、次の2つを控える
   - **キー 1**（32文字の英数字）
   - **場所/地域**（Location/Region）: `eastus` のような小文字の表記

> **価格レベルの注意**: 無料の F0 で発音評価の追加項目（抑揚スコアなど）まで使えるかは、公式ドキュメントでは確認できませんでした。まず F0 で試し、会話後の画面で「抑揚」の値が「—」のままなら、リソースの **価格レベル** を **Standard S0** に変更してください。S0 の費用は、このアプリの使い方（自分の発話だけ・月4時間程度）なら月数百円の見込みです。

---

## 3. `.env.local` にキーを書き込む

1. VS Code などでプロジェクトのフォルダ `C:\Users\ondai\.claude\English-Speaking-Practice` を開く
2. `.env.local` を開く。すでに DB・OpenAI・ログイン用パスワードは入っています
3. 次の行の `=` の右側に貼り付ける。**引用符（"）やスペースは付けない**

   ```
   ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
   AZURE_SPEECH_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   AZURE_SPEECH_REGION=eastus
   ```

4. 保存する

### 確認
ターミナル（プロジェクトのフォルダ）で次を実行する。

```bash
npm run check
```

次のように、すべて ✅ になれば完了です。Azure を設定していなければ ⚪ のままで構いません。

```
✅ ログイン設定 (APP_PASSWORD / AUTH_SECRET): 設定済み
✅ DB (DATABASE_URL): 接続OK（表現 108 件）
✅ OpenAI (OPENAI_API_KEY): gpt-realtime-mini を利用可能
✅ Anthropic (ANTHROPIC_API_KEY): claude-sonnet-5 を利用可能
✅ Azure Speech (AZURE_SPEECH_KEY / REGION): リージョン eastus で認証OK
```

| ❌ の内容 | 対処 |
|---|---|
| Anthropic: `401` / `authentication` | キーの貼り間違いか、削除済みのキー。新しく作り直す |
| Anthropic: `404` / `not_found` | そのアカウントで `claude-sonnet-5` が使えない。Console の組織・ワークスペースを確認する |
| Azure: `HTTP 401` | キーとリージョンの組み合わせが違う。「場所/地域」の表記（`eastus`）を確認する |
| DB: 表が空 | `npm run db:push` → `npm run db:seed` |

---

## 4. 本番用の DB を Vercel で作る（一時DBからの切り替え）

最初に作った一時DBは約72時間で消えます。また、Vercel 経由で管理されている Neon の組織には引き取り（Claim）できません。そこで、Vercel から DB を作り直します。一時DBには初期データしか入っていないので、失うものはありません。

1. https://vercel.com/dashboard → **Storage** → **Create Database** → **Neon** → **Continue**
2. Region は **Tokyo**（なければ Singapore）、Plan は **Free**、名前は `english-speaking` などにして **Create** を押す。Vercel プロジェクトとの紐付けはスキップしてかまいません
3. 作成した DB の **.env.local** タブで `DATABASE_URL` の値（`postgresql://...`）をコピーする
4. `.env.local` の `DATABASE_URL=` の右側を置き換え、`DATABASE_URL_DIRECT=` と `PUBLIC_POSTGRES_CLAIM_URL=` の行を削除する
5. 表を作って初期データを入れる
   ```bash
   npm run db:push
   npm run db:seed
   ```

### 確認
`npm run check` の DB の行が「✅ 接続OK（表現 108 件）」になれば完了です。

## 5. 起動して最初の会話をする

1. ターミナルで起動する
   ```bash
   npm run dev
   ```
2. ブラウザ（Chrome 推奨）で http://localhost:3000 を開く
3. パスワードを入力する。パスワードは `.env.local` の `APP_PASSWORD` の値です（ログイン状態は30日保持されます）
4. 先に **プロフィール** を開き、自己紹介と興味のある話題を書いて保存する。会話の AI と分析がこれを参考にします
5. **マイク付きのイヤホン**をつける。スピーカーだと AI が自分の声を拾って反応してしまいます
6. ホームで **レベル診断** を選び、**会話を始める** を押す。マイクの許可を求められたら「許可」を選ぶ
7. AI が先に話しかけてくるので、5〜10分ほど話す
8. **終了してフィードバックへ** を押す。30秒〜1分でフィードバックが表示されます

### うまくいかないとき

| 症状 | 対処 |
|---|---|
| 「接続中…」のまま進まない | マイクの許可を確認する（アドレスバー左の鍵アイコン → マイク → 許可）。ページを再読み込みする |
| AI の声が聞こえない | PC の出力先がイヤホンになっているか確認する |
| AI が自分の声に反応して話し続ける | イヤホンを使う。スピーカーでの使用は想定していません |
| フィードバックが「分析に失敗しました」 | エラー文を確認し、`npm run check` を再実行する。直したら画面の **再分析** を押す |
| 発音のスコアが出ない | Azure の設定を確認する（手順2・3） |

最初の会話が終わったら、その結果（特に費用、発音スコアが妥当か、指摘の質）を Claude Code で共有してください。分析の指示文を調整します。

---

## 6. スマホで使えるようにする（任意・後日でよい）

スマホのブラウザでマイクを使うには HTTPS が必要なので、`localhost` では使えません。Vercel（無料の Hobby プラン）に公開します。パスワードで保護されているので、URL を知られても他人は使えません。

1. Vercel CLI を入れてログインする
   ```bash
   npm i -g vercel
   vercel login
   ```
2. プロジェクトのフォルダで Vercel のプロジェクトと紐付ける（質問にはすべて既定値で答えて構いません）
   ```bash
   vercel link
   ```
3. 環境変数を登録する。`.env.local` と同じ値を、次の8つについて1つずつ入れる
   ```bash
   vercel env add APP_PASSWORD production
   vercel env add AUTH_SECRET production
   vercel env add DATABASE_URL production
   vercel env add OPENAI_API_KEY production
   vercel env add ANTHROPIC_API_KEY production
   vercel env add AZURE_SPEECH_KEY production
   vercel env add AZURE_SPEECH_REGION production
   vercel env add MONTHLY_BUDGET_JPY production
   ```
4. 公開する
   ```bash
   vercel deploy --prod
   ```
5. 表示された URL（`https://〜.vercel.app`）をスマホで開いてログインする。iPhone なら Safari の共有メニュー → **ホーム画面に追加** で、アプリのように起動できます

Claude Code に「Vercel にデプロイして」と頼めば、手順3〜4を代わりに進めます（ログインだけは `! vercel login` でご自身で実行してください）。

---

## 毎週の習慣: 週次レビュー

週に1回（例: 日曜の夜）、Claude Code でこのフォルダを開き、次のように頼んでください。

```
/weekly-review
```

1週間の練習データを振り返り、2〜4個の質問に答えると、翌週のテーマと新しい表現が自動で登録されます。7日以上レビューしていないと、アプリのホームにお知らせが出ます。
