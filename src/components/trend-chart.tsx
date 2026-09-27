/**
 * 1指標だけを描く小さな折れ線（系列が1つなので凡例は不要、見出しが名前を示す）。
 * 指標ごとに別チャートにして二重軸を避ける。点には拡大したヒット領域とツールチップを付ける。
 * 見た目は「数字が主役、線は脇役」: 大きな最新値と、細い線だけ。
 */
export function TrendChart({
  title,
  unit = "",
  points,
  higherIsBetter = true,
  color = "var(--fg)",
}: {
  title: string;
  unit?: string;
  points: { label: string; value: number | null }[];
  higherIsBetter?: boolean;
  color?: string;
}) {
  const data = points.filter((p): p is { label: string; value: number } => p.value !== null);
  const W = 320;
  const H = 96;
  const pad = { l: 2, r: 6, t: 8, b: 16 };
  const latest = data.at(-1)?.value;
  const first = data[0]?.value;
  const delta = latest !== undefined && first !== undefined && data.length > 1 ? latest - first : null;
  const improving = delta === null ? null : higherIsBetter ? delta > 0 : delta < 0;

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const lo = min - span * 0.3;
  const hi = max + span * 0.3;
  const x = (i: number) =>
    pad.l + (data.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (data.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");

  return (
    <figure className="border-t border-line pt-3">
      <figcaption className="eyebrow">{title}</figcaption>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="numeral text-4xl">{latest !== undefined ? Math.round(latest * 10) / 10 : "—"}</span>
        {unit && <span className="font-mono text-xs text-muted">{unit}</span>}
        {delta !== null && delta !== 0 && (
          <span className={`ml-auto font-mono text-xs ${improving ? "text-good" : "text-bad"}`}>
            {delta > 0 ? "+" : "−"}
            {Math.abs(Math.round(delta * 10) / 10)}
          </span>
        )}
      </div>
      {data.length === 0 ? (
        <p className="py-8 text-sm text-muted">データがまだありません</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label={`${title}の推移`}>
          <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--line)" strokeWidth={1} />
          <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
          {data.map((d, i) => (
            <g key={i}>
              <circle
                cx={x(i)}
                cy={y(d.value)}
                r={i === data.length - 1 ? 3.5 : 2}
                fill={i === data.length - 1 ? "var(--accent)" : color}
              />
              <circle cx={x(i)} cy={y(d.value)} r={12} fill="transparent">
                <title>{`${d.label}: ${Math.round(d.value * 10) / 10}${unit}`}</title>
              </circle>
            </g>
          ))}
          <text x={pad.l} y={H - 3} fontSize={9} fill="var(--muted)" fontFamily="var(--font-mono)">
            {data[0].label}
          </text>
          {data.length > 1 && (
            <text x={W - pad.r} y={H - 3} fontSize={9} fill="var(--muted)" textAnchor="end" fontFamily="var(--font-mono)">
              {data.at(-1)!.label}
            </text>
          )}
        </svg>
      )}
    </figure>
  );
}
