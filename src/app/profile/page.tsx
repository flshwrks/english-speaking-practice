import { connection } from "next/server";
import { LevelSlider, SubmitButton } from "@/components/form-controls";
import { Header, Page } from "@/components/ui";
import { getProfile } from "@/lib/lesson";
import { saveProfile } from "../actions";

function FieldLabel({ index, children, hint }: { index: string; children: React.ReactNode; hint?: string }) {
  return (
    <span className="mb-2 flex items-baseline gap-3 text-sm font-bold">
      <span className="font-mono text-xs font-medium text-muted">{index}</span>
      {children}
      {hint && <span className="ml-auto text-xs font-normal text-muted">{hint}</span>}
    </span>
  );
}

export default async function ProfilePage() {
  await connection(); // 個人データを毎回 DB から読むため静的生成しない
  const p = await getProfile();
  return (
    <Page>
      <Header back={null} eyebrow="Settings" title="プロフィール" subtitle="会話の相手と分析が参考にします" />

      <p className="mb-10 border-l-2 border-line-strong pl-4 text-sm leading-relaxed text-muted">
        ここに書いた内容をもとに、相手役が話題を選んだり、フィードバックの観点を調整したりします。英語でも日本語でも構いません。
      </p>

      <form action={saveProfile} className="flex flex-col gap-8">
        <label className="flex flex-col border-t border-fg pt-3">
          <FieldLabel index="01">自己紹介・背景</FieldLabel>
          <textarea name="about" defaultValue={p.about} rows={4} className="field" />
        </label>
        <label className="flex flex-col border-t border-fg pt-3">
          <FieldLabel index="02">目標</FieldLabel>
          <textarea name="goals" defaultValue={p.goals} rows={3} className="field" />
        </label>
        <label className="flex flex-col border-t border-fg pt-3">
          <FieldLabel index="03" hint="例: テクノロジー、サッカー、旅行">
            興味のある話題
          </FieldLabel>
          <input name="interests" defaultValue={p.interests} className="field" />
        </label>
        <div className="flex flex-col border-t border-fg pt-3">
          <FieldLabel index="04" hint="会話のあとに自動で調整されます">
            会話の難易度
          </FieldLabel>
          <LevelSlider name="level" defaultValue={p.level} />
        </div>
        <div className="flex justify-end border-t border-line pt-5">
          <SubmitButton>保存する</SubmitButton>
        </div>
      </form>
    </Page>
  );
}
