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
      className={`mx-auto w-full px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:px-8 lg:px-10 lg:pt-10 lg:pb-16 ${
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
    <div className="relative mb-6 flex items-end justify-between gap-4 lg:mb-8">
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
  id,
  title,
  aside,
  children,
  className = "",
}: {
  id?: string;
  title: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`mb-10 scroll-mt-16 ${className}`}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-bold">{title}</h2>
        {aside && <div className="meta shrink-0">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

export type Tone = "neutral" | "primary" | "accent" | "good" | "warn";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-sunken text-fg-2",
  primary: "bg-primary-soft text-primary",
  accent: "bg-accent-soft text-accent",
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
};

/** 小さなラベル。色は意味があるときだけ（藍=新しい・朱=要注意・緑=できた・黄土=途中） */
export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 text-xs leading-5 font-medium whitespace-nowrap ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}

/** 細い横棒（予算など） */
export function Meter({ value, warn = false }: { value: number; warn?: boolean }) {
  return (
    <div className="h-1 overflow-hidden rounded-full bg-sunken">
      <div
        className={`h-full rounded-full ${warn ? "bg-accent" : "bg-primary"}`}
        style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }}
      />
    </div>
  );
}

const TARGET = 80;

/** スコア（0〜100）の良し悪し: 目標 80 以上＝緑、65 以上＝黄土、それ未満＝朱 */
export function scoreTone(v: number | null | undefined): Tone {
  if (v == null) return "neutral";
  return v >= TARGET ? "good" : v >= 65 ? "warn" : "accent";
}
const FILL: Record<Tone, string> = {
  neutral: "bg-line-strong",
  primary: "bg-primary",
  accent: "bg-accent",
  good: "bg-good",
  warn: "bg-warn",
};
const TEXT: Record<Tone, string> = {
  neutral: "text-muted",
  primary: "text-primary",
  accent: "text-accent",
  good: "text-good",
  warn: "text-warn",
};

/**
 * 0〜100 のスコア: 数字は良し悪しの色、棒は今回まで、縦線が目標 80、白抜きの丸が前回。
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
  const tone = scoreTone(value);
  return (
    <div className="grid grid-cols-[4.5rem_2.5rem_minmax(0,1fr)] items-center gap-3">
      <span className="text-sm text-fg-2">{label}</span>
      <span className={`text-right text-[17px] font-bold tabular-nums ${TEXT[tone]}`}>
        {value == null ? "—" : Math.round(value)}
      </span>
      <span className="relative h-5" aria-hidden>
        <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-sunken" />
        {value != null && (
          <span
            className={`absolute top-1/2 left-0 h-1.5 -translate-y-1/2 rounded-full ${FILL[tone]}`}
            style={{ width: pos(value) }}
          />
        )}
        <span className="absolute top-0.5 h-4 w-0.5 rounded-full bg-fg/60" style={{ left: pos(TARGET) }} />
        {prev != null && (
          <span
            className="absolute top-1/2 size-2.5 -translate-1/2 rounded-full border-2 border-fg-2 bg-surface"
            style={{ left: pos(prev) }}
            title={`前回 ${Math.round(prev)}`}
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
                    w.week < current ? "bg-primary" : w.week === current ? "bg-accent" : "bg-line-strong/60"
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

/** 読み込み中の骨組み（行の数だけ灰色の帯） */
export function SkeletonLines({ rows = 3, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-3 ${className}`} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-4" style={{ width: `${[92, 76, 84, 64, 88][i % 5]}%` }} />
      ))}
    </div>
  );
}

/** 画面下に数秒だけ出るお知らせ（保存・追加などの完了） */
export function Toast({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-50 inline-flex animate-toast items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium whitespace-nowrap text-ink-fg shadow-float lg:bottom-8"
    >
      {children}
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
