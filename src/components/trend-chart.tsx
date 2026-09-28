/**
 * 推移のグラフ（サーバーで SVG を描く）。
 * - ScoreChart: 0〜100 の3指標を1枚に。色ではなく線種と線端のラベルで見分ける（凡例も付ける）
 * - TrendChart: 1指標だけの小さな折れ線
 * どちらも点が3つ未満なら線を引かず点だけ（2点の直線は「傾向」に見えてしまうため）
 */

type Point = { label: string; value: number | null };

const MIN_FOR_LINE = 3;

const SERIES_STYLE = [
  { stroke: "var(--primary)", dash: undefined },
  { stroke: "var(--fg-2)", dash: "6 4" },
  { stroke: "var(--muted)", dash: "1.5 4" },
] as const;

type Series = { name: string; points: Point[] }[];

export function ScoreChart({ series }: { series: Series }) {
  const n = Math.max(...series.map((s) => s.points.length), 0);
  if (n === 0) return <p className="meta py-16 text-center">会話をすると、ここにスコアの推移が表示されます</p>;

  // SVG は縮むと文字も縮む。スマホは幅の狭い図を別に描いて、目盛りやラベルを読める大きさに保つ
  return (
    <figure>
      <ScoreSvg series={series} W={640} H={240} className="hidden sm:block" />
      <ScoreSvg series={series} W={340} H={220} className="sm:hidden" />
      <figcaption className="meta mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {series.map((s, si) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <svg width="22" height="6" aria-hidden>
              <line
                x1="1"
                x2="21"
                y1="3"
                y2="3"
                stroke={SERIES_STYLE[si % SERIES_STYLE.length].stroke}
                strokeWidth={2}
                strokeDasharray={SERIES_STYLE[si % SERIES_STYLE.length].dash}
                strokeLinecap="round"
              />
            </svg>
            {s.name}
          </span>
        ))}
        {n < MIN_FOR_LINE && <span>· 3回以上で推移を線で表示します</span>}
      </figcaption>
    </figure>
  );
}

function ScoreSvg({ series, W, H, className }: { series: Series; W: number; H: number; className: string }) {
  const pad = { l: 28, r: 84, t: 12, b: 26 };
  const lo = 40;
  const hi = 100;
  const n = Math.max(...series.map((s) => s.points.length), 0);
  const x = (i: number) => pad.l + (n <= 1 ? (W - pad.l - pad.r) / 2 : (i / (n - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const labels = series[0]?.points.map((p) => p.label) ?? [];
  const drawLine = n >= MIN_FOR_LINE;

  // 線端のラベルが重ならないよう、値の順に最低 14px ずつずらす
  const ends = series
    .map((s, si) => {
      const last = s.points.findLastIndex((p) => p.value !== null);
      return last < 0 ? null : { si, name: s.name, value: s.points[last].value!, y: y(s.points[last].value!) };
    })
    .filter((e) => e !== null)
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 14);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`w-full ${className}`} role="img" aria-label="発音・流暢さ・抑揚の推移">
      {[60, 80, 100].map((g) => (
        <g key={g}>
          <line x1={pad.l} x2={W - pad.r} y1={y(g)} y2={y(g)} stroke="var(--line)" strokeWidth={1} />
          <text x={pad.l - 6} y={y(g) + 3.5} fontSize={11} fill="var(--muted)" textAnchor="end">
            {g}
          </text>
        </g>
      ))}
      {series.map((s, si) => {
        const pts = s.points.map((p, i) => ({ ...p, i })).filter((p) => p.value !== null) as {
          label: string;
          value: number;
          i: number;
        }[];
        const d = pts.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
        const st = SERIES_STYLE[si % SERIES_STYLE.length];
        return (
          <g key={s.name}>
            {drawLine && (
              <path
                d={d}
                fill="none"
                stroke={st.stroke}
                strokeWidth={2}
                strokeDasharray={st.dash}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {pts.map((p) => (
              <g key={p.i}>
                <circle
                  cx={x(p.i)}
                  cy={y(p.value)}
                  r={drawLine ? 2.5 : 4}
                  fill={st.stroke}
                  stroke="var(--bg)"
                  strokeWidth={1.5}
                />
                <circle cx={x(p.i)} cy={y(p.value)} r={12} fill="transparent">
                  <title>{`${p.label} ${s.name}: ${Math.round(p.value)}`}</title>
                </circle>
              </g>
            ))}
          </g>
        );
      })}
      {ends.map((e) => (
        <text key={e.name} x={W - pad.r + 10} y={e.y + 4} fontSize={12} fill="var(--fg)">
          {e.name} <tspan fontWeight={700}>{Math.round(e.value)}</tspan>
        </text>
      ))}
      {labels.length > 0 && (
        <>
          <text x={x(0)} y={H - 6} fontSize={11} fill="var(--muted)" textAnchor={n > 1 ? "start" : "middle"}>
            {labels[0]}
          </text>
          {n > 1 && (
            <text x={x(n - 1)} y={H - 6} fontSize={11} fill="var(--muted)" textAnchor="end">
              {labels[n - 1]}
            </text>
          )}
        </>
      )}
    </svg>
  );
}

export function TrendChart({
  title,
  unit = "",
  points,
  higherIsBetter = true,
}: {
  title: string;
  unit?: string;
  points: Point[];
  higherIsBetter?: boolean;
}) {
  const data = points.filter((p): p is { label: string; value: number } => p.value !== null);
  const W = 300;
  const H = 72;
  const pad = { l: 4, r: 6, t: 8, b: 8 };
  const latest = data.at(-1)?.value;
  const prev = data.at(-2)?.value;
  const delta = latest !== undefined && prev !== undefined ? latest - prev : null;
  const improving = delta === null ? null : higherIsBetter ? delta > 0 : delta < 0;
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) =>
    pad.l + (data.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (data.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - (v - (min - span * 0.3)) / (span * 1.6)) * (H - pad.t - pad.b);
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const fmt = (v: number) => Math.round(v * 10) / 10;

  return (
    <figure>
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-fg-2">{title}</span>
        <span className="tabular-nums">
          <b className="text-[17px]">{latest !== undefined ? fmt(latest) : "—"}</b>
          {unit && <span className="meta ml-1">{unit}</span>}
          {delta !== null && delta !== 0 && (
            <span className={`ml-2 text-[13px] ${improving ? "text-good" : "text-accent"}`}>
              {delta > 0 ? "+" : "−"}
              {Math.abs(fmt(delta))}
            </span>
          )}
        </span>
      </figcaption>
      {data.length > 0 && (
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label={`${title}の推移`}>
          <line x1={pad.l} x2={W - pad.r} y1={H - 1} y2={H - 1} stroke="var(--line)" />
          {data.length >= MIN_FOR_LINE && (
            <path
              d={line}
              fill="none"
              stroke="var(--fg-2)"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {data.map((d, i) => (
            <g key={i}>
              <circle
                cx={x(i)}
                cy={y(d.value)}
                r={data.length >= MIN_FOR_LINE && i < data.length - 1 ? 2 : 3.5}
                fill={i === data.length - 1 ? "var(--primary)" : "var(--fg-2)"}
              />
              <circle cx={x(i)} cy={y(d.value)} r={12} fill="transparent">
                <title>{`${d.label}: ${fmt(d.value)}${unit}`}</title>
              </circle>
            </g>
          ))}
        </svg>
      )}
    </figure>
  );
}
