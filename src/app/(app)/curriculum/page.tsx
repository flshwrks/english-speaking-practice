import { Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Page, PageTitle, WeekTrack } from "@/components/ui";
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

type Week = Awaited<ReturnType<typeof getCycleWeeks>>["weeks"][number];

const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
const categoryLine = (w: Week) => w.categories.map((c) => EXPRESSION_CATEGORY_LABEL[c]).join(" · ");

export default async function CurriculumPage() {
  await connection(); // 開始日（DB）と今日の日付で決まるため静的生成しない
  const { profile, currentWeek, weeks } = await getCycleWeeks();
  const cycle = weeks[0]?.cycle ?? 1;
  const phases = [...new Set(weeks.map((w) => w.phase))];
  const current = weeks.find((w) => w.week === currentWeek);

  return (
    <Page
      rail={
        <div className="meta flex flex-col gap-3 leading-relaxed lg:pt-[92px]">
          <p>週が変わると自動で次の週に進みます。2周目からは会話の難易度を上げて同じ流れを回します。</p>
          <p>
            週次レビュー（Claude Code の <code className="font-medium text-fg">/weekly-review</code>
            ）で、その週の内容を調整したり、同じ週を繰り返したりできます。
          </p>
          {profile.weekOffset > 0 && (
            <p className="text-fg">これまでに {profile.weekOffset} 週ぶん繰り返しています。</p>
          )}
        </div>
      }
    >
      <PageTitle sub={`${SYLLABUS.length}週で1周 · いまは${cycle}周目`}>カリキュラム</PageTitle>

      <div className="mb-8">
        <WeekTrack current={currentWeek} size="lg" />
      </div>

      {current && (
        <section className="panel mb-10 px-5 py-5 lg:px-7 lg:py-6">
          <p className="meta">
            <span className="font-medium text-accent">今週</span> · 第{current.week}週 · {shortDate(current.weekStart)}
            〜{current.overrideId && " · 調整あり"}
          </p>
          <h2 className="mt-1 text-xl leading-snug font-bold">{current.theme}</h2>
          <p className="mt-2 max-w-[42em] text-fg-2">{current.focus}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {current.scenarioIds.map((id) => (
              <Link key={id} href={`/session/new?scenario=${id}`} className="btn">
                {getScenario(id)?.title ?? id}
                <ChevronRight size={16} strokeWidth={1.75} />
              </Link>
            ))}
          </div>
          <p className="meta mt-3">表現: {categoryLine(current)}</p>
        </section>
      )}

      {phases.map((phase) => (
        <section key={phase} className="mb-8">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-bold">{phase}</h2>
            <span className="meta">{PHASE_BLURB[phase]}</span>
          </div>
          <ul className="border-t border-line">
            {weeks
              .filter((w) => w.phase === phase)
              .map((w) => (
                <li key={w.week} className="border-b border-line">
                  <details className="group">
                    <summary className="grid grid-cols-[1.25rem_2rem_3.5rem_minmax(0,1fr)_auto] items-center gap-x-2 py-3 hover:bg-surface">
                      <span className="flex justify-center">
                        {w.week < currentWeek ? (
                          <Check size={15} strokeWidth={2.25} className="text-primary" />
                        ) : w.week === currentWeek ? (
                          <span className="size-2 rounded-full bg-accent" />
                        ) : null}
                      </span>
                      <span className={`text-sm tabular-nums ${w.week === currentWeek ? "font-bold" : "text-muted"}`}>
                        {w.week}
                      </span>
                      <span className="meta tabular-nums">{shortDate(w.weekStart)}〜</span>
                      <span
                        className={`truncate ${w.week === currentWeek ? "font-bold" : w.week < currentWeek ? "text-fg-2" : ""}`}
                      >
                        {w.theme}
                        {w.overrideId && <span className="meta ml-2">調整あり</span>}
                      </span>
                      <ChevronRight
                        size={16}
                        strokeWidth={1.75}
                        className="text-muted transition-transform group-open:rotate-90"
                      />
                    </summary>
                    <div className="pb-4 pl-[4.25rem] sm:pl-[7.75rem]">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        {w.scenarioIds.map((id) => (
                          <Link
                            key={id}
                            href={`/session/new?scenario=${id}`}
                            className="font-medium underline underline-offset-4 hover:decoration-2"
                          >
                            {getScenario(id)?.title ?? id}
                          </Link>
                        ))}
                      </div>
                      <p className="meta mt-1">表現: {categoryLine(w)}</p>
                    </div>
                  </details>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </Page>
  );
}
