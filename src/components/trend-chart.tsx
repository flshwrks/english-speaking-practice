import { TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { useId } from "react";
import { Badge } from "./ui";

/**
 * 1指標だけを描く小さな面グラフ（系列が1つなので凡例は不要、タイトルが名前を示す）。
 * 指標ごとに別チャートにして二重軸を避ける。点には拡大したヒット領域とツールチップを付ける。
 */
export function TrendChart({
  title,
  unit = "",
  points,
  higherIsBetter = true,
  color = "var(--accent)",
  icon: Icon,
}: {
  title: string;
  unit?: string;
  points: { label: string; value: number | null }[];
  higherIsBetter?: boolean;
  color?: string;
  icon?: LucideIcon;
}) {
  const data = points.filter((p): p is { label: string; value: number } => p.value !== null);
  const W = 320;
  const H = 120;
  const pad = { l: 26, r: 10, t: 12, b: 20 };
  const latest = data.at(-1)?.value;
  const first = data[0]?.value;
  const delta = latest !== undefined && first !== undefined && data.length > 1 ? latest - first : null;
  const improving = delta === null ? null : higherIsBetter ? delta > 0 : delta < 0;
  const gradientId = useId();

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const lo = Math.max(0, min - span * 0.25);
  const hi = max + span * 0.25;
  const x = (i: number) =>
    pad.l + (data.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (data.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const area = data.length > 1 ? `${line} L${x(data.length - 1)},${H - pad.b} L${x(0)},${H - pad.b} Z` : "";
  const ticks = [lo, (lo + hi) / 2, hi];

  return (
    <figure className="card p-4">
      <figcaption className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-extrabold">
          {Icon && (
            <span
              className="inline-flex size-7 items-center justify-center rounded-lg"
              style={{ background: `color-mix(in oklab, ${color} 16%, transparent)`, color }}
            >
              <Icon size={15} strokeWidth={2.5} />
            </span>
          )}
          {title}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-lg font-extrabold tabular-nums">
            {latest !== undefined ? `${Math.round(latest * 10) / 10}` : "—"}
            <span className="text-xs font-bold text-muted">{unit}</span>
          </span>
          {delta !== null && delta !== 0 && (
            <Badge tone={improving ? "mint" : "coral"}>
              {delta > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {Math.abs(Math.round(delta * 10) / 10)}
            </Badge>
          )}
        </span>
      </figcaption>
      {data.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">データがまだありません</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label={`${title}の推移`}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: color, stopOpacity: 0.28 }} />
              <stop offset="1" style={{ stopColor: color, stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          {ticks.map((v, i) => (
            <g key={i}>
              <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} strokeDasharray="3 4" />
              <text x={pad.l - 5} y={y(v) + 3} textAnchor="end" fontSize={9} fill="var(--muted)">
                {Math.round(v)}
              </text>
            </g>
          ))}
          {area && <path d={area} fill={`url(#${gradientId})`} />}
          <path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          {data.map((d, i) => (
            <g key={i}>
              <circle
                cx={x(i)}
                cy={y(d.value)}
                r={i === data.length - 1 ? 5 : 3.5}
                fill={color}
                stroke="var(--surface)"
                strokeWidth={2}
              />
              <circle cx={x(i)} cy={y(d.value)} r={12} fill="transparent">
                <title>{`${d.label}: ${Math.round(d.value * 10) / 10}${unit}`}</title>
              </circle>
            </g>
          ))}
          <text x={pad.l} y={H - 5} fontSize={9} fill="var(--muted)">
            {data[0].label}
          </text>
          {data.length > 1 && (
            <text x={W - pad.r} y={H - 5} fontSize={9} fill="var(--muted)" textAnchor="end">
              {data.at(-1)!.label}
            </text>
          )}
        </svg>
      )}
    </figure>
  );
}
