import { connection } from "next/server";
import { Badge, Header, Page } from "@/components/ui";
import { EXPRESSION_CATEGORY_LABEL } from "@/lib/categories";
import { getCycleWeeks } from "@/lib/lesson";
import { getScenario } from "@/lib/scenarios";
import { SYLLABUS } from "@/lib/syllabus";

export default async function CurriculumPage() {
  await connection(); // 開始日（DB）と今日の日付で決まるため静的生成しない
  const { profile, currentWeek, weeks } = await getCycleWeeks();

  return (
    <Page>
      <Header title={`カリキュラム（${SYLLABUS.length}週）`} />
      <p className="mb-4 text-sm text-muted">
        週が変わると自動で次の週に進みます。{SYLLABUS.length}週で1周し、2周目からは会話の難易度が上がった状態で同じ流れを回します。
        週次レビュー（Claude Code の <code>/weekly-review</code>）で、その週の内容を調整したり、同じ週を繰り返したりできます。
        {profile.weekOffset > 0 && ` これまでに ${profile.weekOffset} 週ぶん繰り返しています。`}
      </p>
      <ol className="flex flex-col gap-2">
        {weeks.map((w) => {
          const isCurrent = w.week === currentWeek;
          return (
            <li key={w.week} className={`card ${isCurrent ? "border-accent" : ""}`}>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>
                  Week {w.week}・{w.phase}・{w.weekStart}〜{w.week > currentWeek && "（予定）"}
                </span>
                {isCurrent && <Badge>今週</Badge>}
                {w.overrideId && <Badge>調整あり</Badge>}
              </div>
              <div className="mt-1 font-medium">{w.theme}</div>
              <div className="mt-1 text-xs text-muted">
                シナリオ: {w.scenarioIds.map((id) => getScenario(id)?.title ?? id).join("、")}
                ／表現: {w.categories.map((c) => EXPRESSION_CATEGORY_LABEL[c]).join("、")}
              </div>
            </li>
          );
        })}
      </ol>
    </Page>
  );
}
