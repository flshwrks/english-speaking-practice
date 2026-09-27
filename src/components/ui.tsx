import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { TONES, type Tone } from "./illustrations";

export function Page({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className={`mx-auto w-full ${wide ? "max-w-5xl" : "max-w-3xl"} px-5 pt-6 pb-28 sm:px-8 sm:pt-10 md:pb-20`}>
      {children}
    </main>
  );
}

/** ページ上部の見出し（小見出し＋大きなタイトル＋補足） */
export function Header({
  title,
  eyebrow,
  subtitle,
  back = "/",
  aside,
}: {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  subtitle?: React.ReactNode;
  back?: string | null;
  aside?: React.ReactNode;
}) {
  return (
    <header className="mb-8">
      {back && (
        <Link href={back} className="btn-ghost -ml-2.5 mb-4" aria-label="戻る">
          <ArrowLeft size={16} />
          戻る
        </Link>
      )}
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
          <h1 className="text-[28px] leading-tight font-bold tracking-tight sm:text-4xl">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
        </div>
        {aside}
      </div>
    </header>
  );
}

/** セクション見出し: 番号＋見出し＋右側の補足。上に罫線 */
export function SectionTitle({
  children,
  index,
  aside,
}: {
  children: React.ReactNode;
  index?: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3 border-t border-fg pt-3">
      <h2 className="flex items-baseline gap-3 text-[15px] font-bold">
        {index && <span className="font-mono text-xs font-medium text-muted">{index}</span>}
        {children}
      </h2>
      {aside && <div className="text-xs text-muted">{aside}</div>}
    </div>
  );
}

/** 数字の見出し（罫線で区切ったセルに置く） */
export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0 px-4 py-4 first:pl-0 sm:px-5">
      <div className="eyebrow truncate">{label}</div>
      <div className="numeral mt-2 text-[40px] sm:text-5xl">{value}</div>
      {sub && <div className="mt-1 truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}

/** Stat を横に並べる（間に縦の罫線） */
export function StatRow({ children, cols = 3 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  const grid = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" }[cols];
  return <div className={`grid ${grid} divide-x divide-line border-y border-line`}>{children}</div>;
}

export function scoreColor(score: number | null | undefined) {
  if (score == null) return "text-muted";
  if (score >= 85) return "text-good";
  if (score >= 65) return "text-warn";
  return "text-bad";
}

function scoreBar(score: number | null | undefined) {
  if (score == null) return "bg-line";
  if (score >= 85) return "bg-good";
  if (score >= 65) return "bg-sun";
  return "bg-bad";
}

/** 「おすすめ」「今週」などの小さなタグ */
export function Badge({ children, tone = "accent" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`pill ${TONES[tone]}`}>{children}</span>;
}

/** 0〜100 のスコア: 大きな数字と細いバー */
export function ScoreRing({ label, value }: { label: string; value: number | null | undefined }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="min-w-0">
      <div className="eyebrow">{label}</div>
      <div className="numeral mt-2 text-5xl">{value == null ? "—" : Math.round(value)}</div>
      <div className="mt-3 h-1 bg-surface-2">
        <div className={`h-full ${scoreBar(value)}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const BAR_COLOR: Record<Tone, string> = {
  accent: "bg-accent",
  coral: "bg-coral",
  mint: "bg-mint",
  sun: "bg-sun",
  sky: "bg-sky",
};

export function ProgressBar({ value, tone = "accent" }: { value: number; tone?: Tone }) {
  return (
    <div className="h-1 bg-surface-2">
      <div
        className={`h-full ${BAR_COLOR[tone]} transition-[width] duration-700`}
        style={{ width: `${Math.max(1, Math.min(100, value * 100))}%` }}
      />
    </div>
  );
}

/** 何もないときの表示（文字だけで静かに） */
export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="border border-dashed border-line-strong px-6 py-12 text-center">
      <p className="font-serif text-2xl text-muted italic">Nothing here yet.</p>
      <p className="mt-2 font-bold">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}
