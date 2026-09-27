import { notFound } from "next/navigation";
import { ExpressionCard } from "@/components/expression-card";
import { ScenarioArt } from "@/components/illustrations";
import { Header, Page, SectionTitle } from "@/components/ui";
import { pickTodaysExpressions } from "@/lib/expressions";
import { getCurrentCurriculum } from "@/lib/lesson";
import { getScenario } from "@/lib/scenarios";
import { LiveSession } from "./live-session";

const STEPS = [
  { title: "AI が話しかけます", body: "場面に合わせて、相手役が最初に声をかけます" },
  { title: "考えながら話してOK", body: "「話し終えた」を押すまで、AI は待ってくれます" },
  { title: "イヤホン推奨", body: "AI の声をマイクが拾わないようにするためです" },
];

export default async function NewSessionPage({ searchParams }: { searchParams: Promise<{ scenario?: string }> }) {
  const scenario = getScenario((await searchParams).scenario ?? "");
  if (!scenario) notFound();
  // 出題はここで1回だけ決め、開始時にその ID を渡す
  const expressions = await pickTodaysExpressions(scenario, (await getCurrentCurriculum()).curriculum);

  return (
    <Page>
      <LiveSession
        scenarioId={scenario.id}
        scenarioTitle={scenario.title}
        expressions={expressions.map((e) => ({ id: e.id, role: e.role, kind: e.kind, text: e.text, meaning: e.meaning }))}
      >
        <Header eyebrow="Before you start" title={scenario.title} />

        <section className="mb-10 flex animate-rise items-start gap-4 border-y border-line py-5">
          <ScenarioArt id={scenario.id} size={44} />
          <p className="flex-1 text-[15px] leading-relaxed">{scenario.brief}</p>
        </section>

        <ol className="mb-12 grid gap-6 sm:grid-cols-3">
          {STEPS.map(({ title, body }, i) => (
            <li key={title} className="border-t border-fg pt-3">
              <div className="font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</div>
              <div className="mt-2 font-bold">{title}</div>
              <div className="mt-1 text-sm text-muted">{body}</div>
            </li>
          ))}
        </ol>

        <SectionTitle aside={`${expressions.length} items`}>今日の表現</SectionTitle>
        <p className="mb-5 text-sm text-muted">会話の中で使ってみましょう。AI が使いやすい流れを作ります。</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {expressions.map((e) => (
            <ExpressionCard
              key={e.id}
              e={e}
              badge={e.role === "review" ? "復習" : "NEW"}
              badgeTone={e.role === "review" ? "sun" : "accent"}
            />
          ))}
        </div>
      </LiveSession>
    </Page>
  );
}
