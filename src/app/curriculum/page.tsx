import { Check, Info, Repeat2 } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Mascot, ScenarioArt, type Tone } from "@/components/illustrations";
import { Badge, Header, Page } from "@/components/ui";
import { EXPRESSION_CATEGORY_LABEL } from "@/lib/categories";
import { getCycleWeeks } from "@/lib/lesson";
import { SYLLABUS } from "@/lib/syllabus";

/** 段階ごとの色（基礎・会議・応用） */
const PHASE_STYLE: Record<string, { tone: Tone; dot: string; line: string; blurb: string }> = {
  基礎: { tone: "sky", dot: "bg-sky", line: "bg-sky/30", blurb: "自分のことを話す・聞き返す・報告する" },
  会議: { tone: "mint", dot: "bg-mint", line: "bg-mint/30", blurb: "意見を言う・賛否をやわらかく伝える" },
  応用: { tone: "coral", dot: "bg-coral", line: "bg-coral/30", blurb: "プレゼン・交渉・難しい会話" },
};

export default async function CurriculumPage() {
  await connection(); // 開始日（DB）と今日の日付で決まるため静的生成しない
  const { profile, currentWeek, weeks } = await getCycleWeeks();
  const cycle = weeks[0]?.cycle ?? 1;
  const phases = [...new Set(weeks.map((w) => w.phase))];

  return (
    <Page>
      <Header title="カリキュラム" subtitle={`${SYLLABUS.length}週で1周・いまは${cycle}周目`} />

      <div className="mb-6 flex items-start gap-3 rounded-2xl bg-surface-2 p-4 text-sm text-muted">
        <Info size={18} className="mt-0.5 shrink-0 text-accent" />
        <p>
          週が変わると自動で次の週に進みます。2周目からは会話の難易度が上がった状態で同じ流れを回します。 週次レビュー（Claude Code の{" "}
          <code className="font-bold text-fg">/weekly-review</code>）で、その週の内容を調整したり、同じ週を繰り返したりできます。
          {profile.weekOffset > 0 && (
            <span className="ml-1 inline-flex items-center gap-1 font-bold text-fg">
              <Repeat2 size={14} />
              これまでに {profile.weekOffset} 週ぶん繰り返しています。
            </span>
          )}
        </p>
      </div>

      {phases.map((phase) => {
        const style = PHASE_STYLE[phase] ?? PHASE_STYLE["基礎"];
        const items = weeks.filter((w) => w.phase === phase);
        return (
          <section key={phase} className="mb-8">
            <div className="mb-3 flex items-baseline gap-2">
              <Badge tone={style.tone}>{phase}</Badge>
              <span className="text-sm text-muted">{style.blurb}</span>
            </div>
            <ol className="relative flex flex-col gap-3 pl-9">
              <span className={`absolute top-3 bottom-3 left-[13px] w-1 rounded-full ${style.line}`} aria-hidden />
              {items.map((w) => {
                const done = w.week < currentWeek;
                const isCurrent = w.week === currentWeek;
                return (
                  <li key={w.week} className="relative">
                    <span
                      className={`absolute top-5 -left-9 inline-flex size-7 items-center justify-center rounded-full text-xs font-extrabold ring-4 ring-bg ${
                        done ? `${style.dot} text-white` : isCurrent ? "bg-accent text-accent-fg" : "bg-surface text-muted"
                      }`}
                    >
                      {done ? <Check size={15} strokeWidth={3.2} /> : w.week}
                    </span>
                    <div
                      className={`card flex items-start gap-4 p-4 ${
                        isCurrent ? "border-accent/60 ring-4 ring-accent/10" : done ? "opacity-75" : ""
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                          <span className="font-bold">Week {w.week}</span>
                          <span>・{w.weekStart}〜</span>
                          {isCurrent && <Badge>今週</Badge>}
                          {w.overrideId && <Badge tone="sun">調整あり</Badge>}
                        </div>
                        <div className="mt-1 text-[15px] font-extrabold">{w.theme}</div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {w.scenarioIds.map((id) => (
                            <Link
                              key={id}
                              href={`/session/new?scenario=${id}`}
                              className="inline-flex items-center rounded-full transition hover:scale-105"
                              aria-label="このシナリオで練習する"
                            >
                              <ScenarioArt id={id} size={28} />
                            </Link>
                          ))}
                          {w.categories.map((c) => (
                            <span key={c} className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-bold text-muted">
                              {EXPRESSION_CATEGORY_LABEL[c]}
                            </span>
                          ))}
                        </div>
                      </div>
                      {isCurrent && <Mascot mood="cheer" size={56} className="hidden shrink-0 animate-float sm:block" />}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </Page>
  );
}
