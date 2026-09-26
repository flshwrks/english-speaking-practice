import { notFound } from "next/navigation";
import { ExpressionCard } from "@/components/expression-card";
import { Header, Page } from "@/components/ui";
import { pickTodaysExpressions } from "@/lib/expressions";
import { getCurrentCurriculum } from "@/lib/lesson";
import { getScenario } from "@/lib/scenarios";
import { LiveSession } from "./live-session";

export default async function NewSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string }>;
}) {
  const scenario = getScenario((await searchParams).scenario ?? "");
  if (!scenario) notFound();
  // 出題はここで1回だけ決め、開始時にその ID を渡す
  const expressions = await pickTodaysExpressions(scenario, await getCurrentCurriculum());

  return (
    <Page>
      <Header title={scenario.title} />
      <p className="mb-6 text-muted">{scenario.brief}</p>

      <LiveSession
        scenarioId={scenario.id}
        expressions={expressions.map((e) => ({ id: e.id, role: e.role, text: e.text, meaning: e.meaning }))}
      >
        <h2 className="label mb-2">今日の表現</h2>
        <p className="mb-3 text-sm text-muted">
          会話の中で使ってみましょう。AI が使いやすい流れを作ります。
        </p>
        <div className="grid gap-3">
          {expressions.map((e) => (
            <ExpressionCard key={e.id} e={e} badge={e.role === "review" ? "復習" : "新しい表現"} />
          ))}
        </div>
      </LiveSession>
    </Page>
  );
}
