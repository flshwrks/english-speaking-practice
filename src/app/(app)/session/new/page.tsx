import { notFound } from "next/navigation";
import { ExpressionEntry } from "@/components/expression-card";
import { pickTodaysExpressions } from "@/lib/expressions";
import { getCurrentCurriculum } from "@/lib/lesson";
import { getScenario } from "@/lib/scenarios";
import { LiveSession } from "./live-session";

export default async function NewSessionPage({ searchParams }: { searchParams: Promise<{ scenario?: string }> }) {
  const scenario = getScenario((await searchParams).scenario ?? "");
  if (!scenario) notFound();
  // 出題はここで1回だけ決め、開始時にその ID を渡す
  const expressions = await pickTodaysExpressions(scenario, (await getCurrentCurriculum()).curriculum);
  // 役割設定の「You are Alex, ...」から相手の名前を取る（名前がない役なら「相手」）
  const partner = /^You are ([A-Z][a-z]+)\b/.exec(scenario.role)?.[1] ?? "相手";

  return (
    <LiveSession
      scenario={{ id: scenario.id, title: scenario.title, brief: scenario.brief }}
      partner={partner}
      expressions={expressions.map((e) => ({ id: e.id, role: e.role, text: e.text, meaning: e.meaning }))}
    >
      {expressions.map((e) => (
        <ExpressionEntry key={e.id} e={e} status={e.role === "review" ? "復習" : undefined} statusTone="accent" />
      ))}
    </LiveSession>
  );
}
