import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { SYLLABUS } from "@/lib/syllabus";

/**
 * 画面の本文。rail を渡すと PC では右に補助欄（固定）を置く2カラムになる。
 * スマホでは rail は本文の後ろに回る。
 */
export function Page({
  children,
  rail,
  narrow = false,
}: {
  children: React.ReactNode;
  rail?: React.ReactNode;
  narrow?: boolean;
}) {
  return (
    <main
      className={`mx-auto w-full px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-28 sm:px-8 lg:px-10 lg:pt-10 lg:pb-16 ${
        narrow ? "max-w-[760px]" : "max-w-[1120px]"
      }`}
    >
      {rail ? (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10">
          <div className="min-w-0">{children}</div>
          <aside className="min-w-0 lg:sticky lg:top-10 lg:self-start">{rail}</aside>
        </div>
      ) : (
        children
      )}
    </main>
  );
}

/** ページの見出し（右に操作を置ける） */
export function PageTitle({
  children,
  action,
  sub,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4 lg:mb-8">
      <div className="min-w-0">
        <h1 className="text-2xl leading-snug font-bold">{children}</h1>
        {sub && <p className="meta mt-1">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/** 下の階層の画面の上部: 戻り先だけを小さく */
export function BackLink({ href = "/", label = "ホーム" }: { href?: string; label?: string }) {
  return (
    <Link href={href} className="btn-ghost mb-3 -ml-2.5 pl-1.5">
      <ChevronLeft size={18} strokeWidth={1.75} />
      {label}
    </Link>
  );
}

/** 区切りの見出し。数は右に */
export function Section({
  title,
  aside,
  children,
  className = "",
}: {
  title: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`mb-10 ${className}`}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-bold">{title}</h2>
        {aside && <div className="meta shrink-0">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/** 小さなラベル（強調は朱色、それ以外は無彩色） */
export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "accent" }) {
  const cls = {
    neutral: "border border-line-strong text-fg-2",
    accent: "bg-accent-soft text-accent",
  }[tone];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-1.5 text-xs leading-5 font-medium whitespace-nowrap ${cls}`}
    >
      {children}
    </span>
  );
}

/** 細い横棒（予算など） */
export function Meter({ value, warn = false }: { value: number; warn?: boolean }) {
  return (
    <div className="h-0.5 bg-line">
      <div
        className={`h-full ${warn ? "bg-accent" : "bg-fg"}`}
        style={{ width: `${Math.max(1, Math.min(100, value * 100))}%` }}
      />
    </div>
  );
}

const TARGET = 80;

/**
 * 0〜100 のスコアを計器のように: 目盛り線（80＝目標）の上に今回の点、前回は白抜きの印。
 */
export function ScoreBar({
  label,
  value,
  prev,
}: {
  label: string;
  value: number | null | undefined;
  prev?: number | null;
}) {
  const pos = (v: number) => `${Math.max(0, Math.min(100, v))}%`;
  return (
    <div className="grid grid-cols-[4.5rem_2.5rem_minmax(0,1fr)] items-center gap-3">
      <span className="text-sm text-fg-2">{label}</span>
      <span className="text-right text-[17px] font-bold tabular-nums">{value == null ? "—" : Math.round(value)}</span>
      <span className="relative h-5" aria-hidden>
        <span className="absolute inset-x-0 top-1/2 h-px bg-line-strong" />
        <span className="absolute top-1 h-3 w-px bg-muted" style={{ left: pos(TARGET) }} />
        {prev != null && (
          <span
            className="absolute top-1/2 size-2 -translate-1/2 rounded-full border border-muted bg-surface"
            style={{ left: pos(prev) }}
            title={`前回 ${Math.round(prev)}`}
          />
        )}
        {value != null && (
          <span
            className={`absolute top-1/2 size-2.5 -translate-1/2 rounded-full ${value >= TARGET ? "bg-fg" : "bg-accent"}`}
            style={{ left: pos(value) }}
          />
        )}
      </span>
    </div>
  );
}

/** 全体カリキュラム12週の位置。基礎・会議・応用の間に隙間をあける */
export function WeekTrack({ current, size = "sm" }: { current: number; size?: "sm" | "lg" }) {
  const weeks = SYLLABUS.map((w, i) => ({ ...w, week: i + 1 }));
  const phases = [...new Set(weeks.map((w) => w.phase))];
  return (
    <div
      className={`flex ${size === "lg" ? "gap-3" : "gap-1.5"}`}
      aria-label={`全${SYLLABUS.length}週のうち第${current}週`}
    >
      {phases.map((phase) => (
        <div key={phase} className="flex-1">
          <div className={`flex ${size === "lg" ? "gap-1" : "gap-0.5"}`}>
            {weeks
              .filter((w) => w.phase === phase)
              .map((w) => (
                <span
                  key={w.week}
                  title={`第${w.week}週 ${w.theme}`}
                  className={`flex-1 rounded-[2px] ${size === "lg" ? "h-2" : "h-1"} ${
                    w.week < current ? "bg-fg" : w.week === current ? "bg-accent" : "bg-line-strong/60"
                  }`}
                />
              ))}
          </div>
          {size === "lg" && <div className="meta mt-1.5">{phase}</div>}
        </div>
      ))}
    </div>
  );
}

/** 何もないとき */
export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-[14px] border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="font-bold">{title}</p>
      {children && <div className="meta mt-1">{children}</div>}
    </div>
  );
}
