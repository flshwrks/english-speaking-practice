import { Headphones, Hourglass, MessageSquareText, Sparkles } from "lucide-react";
import { notFound } from "next/navigation";
import { ExpressionCard } from "@/components/expression-card";
import { ScenarioArt } from "@/components/illustrations";
import { Header, Page, SectionTitle } from "@/components/ui";
import { pickTodaysExpressions } from "@/lib/expressions";
import { getCurrentCurriculum } from "@/lib/lesson";
import { getScenario } from "@/lib/scenarios";
import { LiveSession } from "./live-session";

const STEPS = [
  { icon: MessageSquareText, title: "AI が話しかけます", body: "場面に合わせて、相手役が最初に声をかけます" },
  { icon: Hourglass, title: "考えながら話してOK", body: "「話し終えた」を押すまで、AI は待ってくれます" },
  { icon: Headphones, title: "イヤホン推奨", body: "AI の声をマイクが拾わないようにするためです" },
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
        <Header title={scenario.title} subtitle="レッスンの準備" />

        <section className="card mb-5 flex animate-rise items-center gap-5">
          <ScenarioArt id={scenario.id} size={72} />
          <p className="flex-1 text-[15px] leading-relaxed">{scenario.brief}</p>
        </section>

        <ol className="mb-8 grid gap-2.5 sm:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <li
              key={title}
              className="flex animate-rise items-start gap-3 rounded-2xl bg-surface-2 p-4"
              style={{ animationDelay: `${80 + i * 60}ms` }}
            >
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-accent shadow-[var(--shadow-soft)]">
                <Icon size={16} strokeWidth={2.5} />
              </span>
              <div>
                <div className="text-sm font-extrabold">{title}</div>
                <div className="text-xs text-muted">{body}</div>
              </div>
            </li>
          ))}
        </ol>

        <SectionTitle icon={Sparkles}>今日の表現</SectionTitle>
        <p className="-mt-1 mb-4 text-sm text-muted">会話の中で使ってみましょう。AI が使いやすい流れを作ります。</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {expressions.map((e) => (
            <ExpressionCard
              key={e.id}
              e={e}
              badge={e.role === "review" ? "復習" : "NEW"}
              badgeTone={e.role === "review" ? "sun" : "mint"}
            />
          ))}
        </div>
      </LiveSession>
    </Page>
  );
}
