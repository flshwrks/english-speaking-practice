import { connection } from "next/server";
import { LevelPicker, SubmitButton } from "@/components/form-controls";
import { Meter, Page, PageTitle } from "@/components/ui";
import { budgetStatus, getProfile } from "@/lib/lesson";
import { saveProfile } from "../actions";

/** 設定の1行: 左に項目名と説明、右に入力 */
function Row({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 border-b border-line py-6 sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-8">
      <div>
        <div className="font-bold">{label}</div>
        {help && <p className="meta mt-0.5">{help}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export default async function ProfilePage() {
  await connection(); // 個人データを毎回 DB から読むため静的生成しない
  const [p, budget] = await Promise.all([getProfile(), budgetStatus()]);
  const ratio = budget.spentJpy / budget.budgetJpy;
  return (
    <Page narrow>
      <PageTitle>設定</PageTitle>

      <form action={saveProfile}>
        <h2 className="border-b border-line pb-2 text-[15px] font-bold">プロフィール</h2>
        <p className="meta mt-2">
          会話の相手が話題を選んだり、フィードバックの観点を決めたりするときに使います。英語でも日本語でも構いません。
        </p>
        <Row label="自己紹介・背景" help="仕事・経歴・英語を使う場面など">
          <textarea name="about" defaultValue={p.about} rows={4} className="field" />
        </Row>
        <Row label="目標" help="できるようになりたいこと">
          <textarea name="goals" defaultValue={p.goals} rows={3} className="field" />
        </Row>
        <Row label="興味のある話題" help="例: テクノロジー、サッカー、旅行">
          <input name="interests" defaultValue={p.interests} className="field" />
        </Row>

        <h2 className="mt-10 border-b border-line pb-2 text-[15px] font-bold">会話</h2>
        <Row label="難易度" help="会話のあとに自動で調整されます">
          <LevelPicker name="level" defaultValue={p.level} />
        </Row>

        <div className="flex justify-end pt-6">
          <SubmitButton>保存する</SubmitButton>
        </div>
      </form>

      <h2 className="mt-12 border-b border-line pb-2 text-[15px] font-bold">利用状況</h2>
      <Row label="今月の API 費用" help="上限に近づくとホームでお知らせします">
        <div className="flex items-baseline justify-between tabular-nums">
          <span className="text-xl font-bold">¥{Math.round(budget.spentJpy).toLocaleString()}</span>
          <span className="meta">上限 ¥{budget.budgetJpy.toLocaleString()}</span>
        </div>
        <div className="mt-2">
          <Meter value={ratio} warn={ratio > 0.8} />
        </div>
      </Row>
    </Page>
  );
}
