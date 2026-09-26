import { connection } from "next/server";
import { Header, Page } from "@/components/ui";
import { getProfile } from "@/lib/lesson";
import { saveProfile } from "../actions";

const field = "w-full rounded-lg border border-line bg-surface px-3 py-2";

export default async function ProfilePage() {
  await connection(); // 個人データを毎回 DB から読むため静的生成しない
  const p = await getProfile();
  return (
    <Page>
      <Header title="プロフィール" />
      <p className="mb-4 text-sm text-muted">
        ここに書いた内容は会話の AI と分析に渡されます。英語でも日本語でも構いません。
      </p>
      <form action={saveProfile} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="label">自己紹介・背景</span>
          <textarea name="about" defaultValue={p.about} rows={4} className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">目標</span>
          <textarea name="goals" defaultValue={p.goals} rows={3} className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">興味のある話題</span>
          <input name="interests" defaultValue={p.interests} className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">会話の難易度（1〜10, 会話後に自動調整）</span>
          <input name="level" type="number" min={1} max={10} defaultValue={p.level} className={`${field} w-24`} />
        </label>
        <button className="btn-primary self-start">保存</button>
      </form>
    </Page>
  );
}
