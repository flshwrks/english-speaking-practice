/**
 * 1指標だけを描く小さな折れ線（系列が1つなので凡例は不要、タイトルが名前を示す）。
 * 指標ごとに別チャートにして二重軸を避ける。点には拡大したヒット領域とツールチップを付ける。
 */
export function TrendChart({
  title,
  unit = "",
  points,
  higherIsBetter = true,
}: {
  title: string;
  unit?: string;
  points: { label: string; value: number | null }[];
  higherIsBetter?: boolean;
}) {
  const data = points.filter((p): p is { label: string; value: number } => p.value !== null);
  const W = 320;
  const H = 120;
  const pad = { l: 28, r: 8, t: 10, b: 18 };
  const latest = data.at(-1)?.value;
  const first = data[0]?.value;
  const delta = latest !== undefined && first !== undefined && data.length > 1 ? latest - first : null;
  const improving = delta === null ? null : higherIsBetter ? delta > 0 : delta < 0;

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const lo = Math.max(0, min - span * 0.2);
  const hi = max + span * 0.2;
  const x = (i: number) => pad.l + (data.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (data.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const path = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const ticks = [lo, (lo + hi) / 2, hi];

  return (
    <figure className="card">
      <figcaption className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-sm tabular-nums">
          {latest !== undefined ? `${Math.round(latest * 10) / 10}${unit}` : "—"}
          {delta !== null && (
            <span className={`ml-2 text-xs ${improving ? "text-good" : "text-muted"}`}>
              {delta > 0 ? "▲" : delta < 0 ? "▼" : "±"}
              {Math.abs(Math.round(delta * 10) / 10)}
            </span>
          )}
        </span>
      </figcaption>
      {data.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">データがまだありません</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label={`${title}の推移`}>
          {ticks.map((v, i) => (
            <g key={i}>
              <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
              <text x={pad.l - 4} y={y(v) + 3} textAnchor="end" fontSize={9} fill="var(--muted)">
                {Math.round(v)}
              </text>
            </g>
          ))}
          <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {data.map((d, i) => (
            <g key={i}>
              <circle cx={x(i)} cy={y(d.value)} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
              <circle cx={x(i)} cy={y(d.value)} r={12} fill="transparent">
                <title>{`${d.label}: ${Math.round(d.value * 10) / 10}${unit}`}</title>
              </circle>
            </g>
          ))}
          <text x={pad.l} y={H - 4} fontSize={9} fill="var(--muted)">{data[0].label}</text>
          {data.length > 1 && (
            <text x={W - pad.r} y={H - 4} fontSize={9} fill="var(--muted)" textAnchor="end">
              {data.at(-1)!.label}
            </text>
          )}
        </svg>
      )}
    </figure>
  );
}
