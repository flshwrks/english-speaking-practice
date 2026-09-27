/** ロゴマーク: 墨色の吹き出しに朱色の点（話す／声の合図） */
export function Logo({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden>
      <path
        d="M3 4.5A1.5 1.5 0 0 1 4.5 3h15A1.5 1.5 0 0 1 21 4.5v11a1.5 1.5 0 0 1-1.5 1.5H10l-5 4v-4h-.5A1.5 1.5 0 0 1 3 15.5z"
        fill="var(--ink)"
      />
      <circle cx="15.5" cy="10" r="2.6" fill="var(--accent)" />
      <rect x="7" y="8.6" width="4.5" height="2.8" rx="1.4" fill="var(--ink-fg)" />
    </svg>
  );
}
