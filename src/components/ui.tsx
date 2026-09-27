import Link from "next/link";

export function Header({ title, back = "/" }: { title: string; back?: string }) {
  return (
    <header className="mb-6 flex items-center gap-3">
      <Link href={back} className="btn" aria-label="戻る">
        ←
      </Link>
      <h1 className="text-lg font-semibold">{title}</h1>
    </header>
  );
}

export function Page({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10">{children}</main>;
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function scoreColor(score: number | null | undefined) {
  if (score == null) return "text-muted";
  if (score >= 85) return "text-good";
  if (score >= 65) return "text-warn";
  return "text-bad";
}

/** 「おすすめ」「今週」などの小さなラベル */
export function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent">{children}</span>;
}

/** フォームの入力欄の共通スタイル */
export const fieldClass = "w-full rounded-lg border border-line bg-surface px-3 py-2";
