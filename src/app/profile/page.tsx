import { Gauge, Heart, NotebookPen, Target } from "lucide-react";
import { connection } from "next/server";
import { LevelSlider, SubmitButton } from "@/components/form-controls";
import { Mascot } from "@/components/illustrations";
import { Header, Page } from "@/components/ui";
import { getProfile } from "@/lib/lesson";
import { saveProfile } from "../actions";

function FieldLabel({ icon: Icon, children, hint }: { icon: typeof Heart; children: React.ReactNode; hint?: string }) {
  return (
    <span className="mb-1.5 flex items-center gap-2 text-sm font-extrabold">
      <Icon size={16} className="text-accent" strokeWidth={2.5} />
      {children}
      {hint && <span className="text-xs font-medium text-muted">{hint}</span>}
    </span>
  );
}

export default async function ProfilePage() {
  await connection(); // 個人データを毎回 DB から読むため静的生成しない
  const p = await getProfile();
  return (
    <Page>
      <Header title="プロフィール" subtitle="会話の相手と分析が参考にします" />

      <section className="card mb-5 flex items-center gap-4 bg-gradient-to-br from-accent-soft to-surface">
        <Mascot mood="listen" size={76} className="shrink-0" />
        <p className="text-sm leading-relaxed">
          あなたのことを教えてください。ここに書いた内容をもとに、相手役が話題を選んだり、フィードバックの観点を調整したりします。
          <span className="text-muted">英語でも日本語でも構いません。</span>
        </p>
      </section>

      <form action={saveProfile} className="card flex flex-col gap-5">
        <label className="flex flex-col">
          <FieldLabel icon={NotebookPen}>自己紹介・背景</FieldLabel>
          <textarea name="about" defaultValue={p.about} rows={4} className="field" />
        </label>
        <label className="flex flex-col">
          <FieldLabel icon={Target}>目標</FieldLabel>
          <textarea name="goals" defaultValue={p.goals} rows={3} className="field" />
        </label>
        <label className="flex flex-col">
          <FieldLabel icon={Heart} hint="例: テクノロジー、サッカー、旅行">
            興味のある話題
          </FieldLabel>
          <input name="interests" defaultValue={p.interests} className="field" />
        </label>
        <div className="flex flex-col">
          <FieldLabel icon={Gauge} hint="会話のあとに自動で調整されます">
            会話の難易度
          </FieldLabel>
          <LevelSlider name="level" defaultValue={p.level} />
        </div>
        <div className="flex justify-end">
          <SubmitButton>保存する</SubmitButton>
        </div>
      </form>
    </Page>
  );
}
