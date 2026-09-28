import { Shuffle } from "lucide-react";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { ExpressionEntry } from "@/components/expression-card";
import { ScenarioCardView } from "@/components/scenario-card";
import { cardFor, cardProgress, cardStep, cardUsage } from "@/lib/cards";
import { pickTodaysExpressions } from "@/lib/expressions";
import { formatDateJst } from "@/lib/format";
import { getCurrentCurriculum } from "@/lib/lesson";
import { getScenario } from "@/lib/scenarios";
import { newCardAction } from "../../actions";
import { LiveSession } from "./live-session";

const nameIn = (text: string) => /^You are ([A-Z][a-z]+)\b/.exec(text)?.[1];

export default async function NewSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string; card?: string }>;
}) {
  const params = await searchParams;
  const scenario = getScenario(params.scenario ?? "");
  if (!scenario) notFound();
  // 出題とお題はここで1回だけ決め、開始時にその ID を渡す。お題カードが作れなくても練習はできるようにする
  const [{ curriculum }, card] = await Promise.all([
    getCurrentCurriculum(),
    cardFor(scenario, Number(params.card) || undefined).catch((e) => {
      console.error("お題カードを用意できませんでした", e);
      return null;
    }),
  ]);
  // カードの表現を今日の表現の新しい枠に先に入れる（場面に合う表現なので使いやすい）
  const [expressions, usage, progress] = await Promise.all([
    pickTodaysExpressions(scenario, curriculum, card?.card),
    card ? cardUsage(card.id) : null,
    cardProgress(),
  ]);
  const step = card && cardStep(card);
  const total = progress.get(scenario.id)?.total ?? 0;
  // 相手の名前はカードの設定（「You are Priya, ...」）を優先し、なければシナリオの役から。どちらにもなければ「相手」
  const partner = (card && nameIn(card.card.partner)) ?? nameIn(scenario.role) ?? "相手";

  return (
    <LiveSession
      scenario={{ id: scenario.id, title: scenario.title, brief: scenario.brief }}
      partner={partner}
      card={card?.card ?? null}
      cardId={card?.id}
      cardPanel={
        card && (
          <ScenarioCardView
            card={card.card}
            label={usage?.count ? "再挑戦のお題" : "今回のお題"}
            step={step && total ? { step, total } : null}
          >
            {usage?.lastAt && (
              <p className="meta mt-3 border-t border-line pt-3">
                {formatDateJst(usage.lastAt)} に話したお題です。終わったら前回と比べられます。
              </p>
            )}
            <form action={newCardAction.bind(null, scenario.id, card.id)} className="mt-3 border-t border-line pt-2">
              <ActionButton className="btn-ghost -ml-2.5 text-[13px]" pendingText="切り替えています…">
                <Shuffle size={15} strokeWidth={1.75} />
                別のお題にする
              </ActionButton>
            </form>
          </ScenarioCardView>
        )
      }
      expressions={expressions.map((e) => ({ id: e.id, role: e.role, text: e.text, meaning: e.meaning }))}
    >
      {expressions.map((e) => (
        <ExpressionEntry key={e.id} e={e} status={e.role === "review" ? "復習" : undefined} statusTone="accent" />
      ))}
    </LiveSession>
  );
}
