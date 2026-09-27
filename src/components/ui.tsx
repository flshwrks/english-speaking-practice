import { ChevronLeft, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Mascot, TONES, type Mood, type Tone } from "./illustrations";

export function Page({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className={`mx-auto w-full ${wide ? "max-w-5xl" : "max-w-3xl"} px-4 pt-5 pb-28 sm:px-6 sm:pt-8 md:pb-16`}>
      {children}
    </main>
  );
}

/** ページ上部の見出し（戻る＋タイトル＋補足） */
export function Header({
  title,
  subtitle,
  back = "/",
  aside,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  back?: string | null;
  aside?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex items-center gap-3">
      {back && (
        <Link
          href={back}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface shadow-[var(--shadow-soft)] transition hover:bg-surface-2 active:scale-95"
          aria-label="戻る"
        >
          <ChevronLeft size={20} />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
      </div>
      {aside}
    </header>
  );
}

export function SectionTitle({
  children,
  icon: Icon,
  aside,
}: {
  children: React.ReactNode;
  icon?: LucideIcon;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-base font-extrabold">
        {Icon && <Icon size={18} className="text-accent" strokeWidth={2.4} />}
        {children}
      </h2>
      {aside}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  icon: Icon,
  tone = "accent",
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon?: LucideIcon;
  tone?: Tone;
}) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-2xl border border-line bg-surface p-3 shadow-[var(--shadow-soft)] sm:flex-row sm:items-center sm:gap-3">
      {Icon && (
        <span
          className={`inline-flex size-9 shrink-0 items-center justify-center rounded-xl sm:size-10 ${TONES[tone]}`}
        >
          <Icon size={19} strokeWidth={2.3} />
        </span>
      )}
      <div className="min-w-0">
        <div className="truncate text-xs text-muted">{label}</div>
        <div className="text-lg leading-tight font-extrabold tabular-nums">{value}</div>
        {sub && <div className="truncate text-[11px] text-muted">{sub}</div>}
      </div>
    </div>
  );
}

export function scoreColor(score: number | null | undefined) {
  if (score == null) return "text-muted";
  if (score >= 85) return "text-good";
  if (score >= 65) return "text-warn";
  return "text-bad";
}

function scoreStroke(score: number | null | undefined) {
  if (score == null) return "var(--line)";
  if (score >= 85) return "var(--good)";
  if (score >= 65) return "var(--sun)";
  return "var(--bad)";
}

/** 「おすすめ」「今週」などの小さなラベル */
export function Badge({ children, tone = "accent" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`pill ${TONES[tone]}`}>{children}</span>;
}

/** 0〜100 のスコアを円で表す */
export function ScoreRing({
  label,
  value,
  size = 88,
}: {
  label: string;
  value: number | null | undefined;
  size?: number;
}) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value)) / 100;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 80 80" width={size} height={size} role="img" aria-label={`${label} ${value ?? "なし"}`}>
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="8" />
        {pct > 0 && (
          <circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            stroke={scoreStroke(value)}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${c * pct} ${c}`}
            transform="rotate(-90 40 40)"
          />
        )}
        <text x="40" y="46" textAnchor="middle" fontSize="19" fontWeight="800" fill="var(--fg)">
          {value == null ? "—" : Math.round(value)}
        </text>
      </svg>
      <span className="text-xs font-bold text-muted">{label}</span>
    </div>
  );
}

/** 進捗の円（中に任意の内容） */
export function ProgressRing({
  value,
  size = 72,
  stroke = 7,
  color = "var(--accent)",
  track = "var(--accent-soft)",
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: React.ReactNode;
}) {
  const r = 50 - stroke;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} className="absolute inset-0" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke={track} strokeWidth={stroke * 1.4} />
        {value > 0 && (
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke * 1.4}
            strokeLinecap="round"
            strokeDasharray={`${c * Math.max(0, Math.min(1, value))} ${c}`}
            transform="rotate(-90 50 50)"
          />
        )}
      </svg>
      <div className="relative text-center">{children}</div>
    </div>
  );
}

const BAR_COLOR: Record<Tone, string> = { accent: "bg-accent", coral: "bg-coral", mint: "bg-mint", sun: "bg-sun", sky: "bg-sky" };

export function ProgressBar({ value, tone = "accent" }: { value: number; tone?: Tone }) {
  const color = BAR_COLOR[tone];
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
      <div
        className={`h-full rounded-full ${color} transition-[width] duration-700`}
        style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }}
      />
    </div>
  );
}

/** 何もないときの表示（マスコット付き） */
export function EmptyState({
  title,
  children,
  mood = "sleepy",
}: {
  title: string;
  children?: React.ReactNode;
  mood?: Mood;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-dashed border-line bg-surface/60 px-6 py-10 text-center">
      <Mascot mood={mood} size={84} className="animate-float" />
      <p className="font-bold">{title}</p>
      {children && <div className="text-sm text-muted">{children}</div>}
    </div>
  );
}
