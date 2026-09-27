import { ArrowUpRight, Check } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Badge, Header, Page, SectionTitle } from "@/components/ui";
import { EXPRESSION_CATEGORY_LABEL } from "@/lib/categories";
import { getCycleWeeks } from "@/lib/lesson";
import { getScenario } from "@/lib/scenarios";
import { SYLLABUS } from "@/lib/syllabus";

/** 段階ごとの説明（基礎・会議・応用） */
const PHASE_BLURB: Record<string, string> = {
  基礎: "自分のことを話す・聞き返す・報告する",
  会議: "意見を言う・賛否をやわらかく伝える",
  応用: "プレゼン・交渉・難しい会話",
};

const pad2 = (n: number) => String(n).padStart(2, "0");

export default async function CurriculumPage() {
  await connection(); // 開始日（DB）と今日の日付で決まるため静的生成しない
  const { profile, currentWeek, weeks } = await getCycleWeeks();
  const cycle = weeks[0]?.cycle ?? 1;
  const phases = [...new Set(weeks.map((w) => w.phase))];

  return (
    <Page>
      <Header
        back={null}
        eyebrow={`Cycle ${cycle} / ${SYLLABUS.length} weeks`}
        title="カリキュラム"
        subtitle={`${SYLLABUS.length}週で1周・いまは${cycle}周目`}
      />

      <p className="mb-12 border-l-2 border-line-strong pl-4 text-sm leading-relaxed text-muted">
        週が変わると自動で次の週に進みます。2周目からは会話の難易度が上がった状態で同じ流れを回します。週次レビュー（Claude Code の{" "}
        <code className="font-mono text-[13px] text-fg">/weekly-review</code>）で、その週の内容を調整したり、同じ週を繰り返したりできます。
        {profile.weekOffset > 0 && (
          <b className="ml-1 text-fg">これまでに {profile.weekOffset} 週ぶん繰り返しています。</b>
        )}
      </p>

      {phases.map((phase, pi) => (
        <section key={phase} className="mb-12">
          <SectionTitle index={pad2(pi + 1)} aside={PHASE_BLURB[phase]}>
            {phase}
          </SectionTitle>
          <ol className="border-t border-line">
            {weeks
              .filter((w) => w.phase === phase)
              .map((w) => {
                const done = w.week < currentWeek;
                const isCurrent = w.week === currentWeek;
                return (
                  <li
                    key={w.week}
                    className={`relative flex gap-5 border-b border-line py-5 ${
                      done ? "text-muted" : ""
                    }`}
                  >
                    {isCurrent && <span className="absolute inset-y-0 -left-3 w-0.5 bg-accent sm:-left-4" />}
                    <span className={`numeral w-10 shrink-0 text-3xl ${isCurrent ? "text-accent" : ""}`}>
                      {done ? <Check size={22} className="mt-1.5 text-good" /> : pad2(w.week)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted">
                        <span>FROM {w.weekStart}</span>
                        {isCurrent && <Badge>今週</Badge>}
                        {w.overrideId && <Badge tone="sun">調整あり</Badge>}
                      </div>
                      <div className={`mt-1 font-bold ${done ? "" : "text-fg"}`}>{w.theme}</div>
                      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                        {w.scenarioIds.map((id) => (
                          <Link
                            key={id}
                            href={`/session/new?scenario=${id}`}
                            className="inline-flex items-center gap-0.5 font-bold text-fg underline decoration-line-strong underline-offset-4 hover:decoration-accent"
                          >
                            {getScenario(id)?.title ?? id}
                            <ArrowUpRight size={12} />
                          </Link>
                        ))}
                        {w.categories.map((c) => (
                          <span key={c} className="text-muted">
                            #{EXPRESSION_CATEGORY_LABEL[c]}
                          </span>
                        ))}
                      </div>
                    </div>
                  </li>
                );
              })}
          </ol>
        </section>
      ))}
    </Page>
  );
}
