/**
 * イラスト（SVG）。マスコット「トキ」＝吹き出しの形をした話し相手のキャラクター。頭の双葉は「成長」の印。
 * 色は CSS 変数から取るので、ライト／ダークの両方で馴染む。
 */
import { useId } from "react";
import {
  BriefcaseBusiness,
  Coffee,
  Compass,
  Handshake,
  HeartHandshake,
  Lightbulb,
  MessageCircleQuestion,
  MessagesSquare,
  Presentation,
  type LucideIcon,
  ClipboardList,
} from "lucide-react";

export type Mood = "happy" | "think" | "cheer" | "listen" | "sleepy";

const INK = "#241f3a";

/** size を省くと className（例: size-20）で大きさを決められる */
export function Mascot({ mood = "happy", size, className = "" }: { mood?: Mood; size?: number; className?: string }) {
  // グラデーションの ID は1体ごとに固有にする（同じ ID が画面内に複数あると、非表示の要素を参照して描画に失敗することがある）
  const id = useId();
  const body = `${id}-body`;
  const shine = `${id}-shine`;
  return (
    <svg
      viewBox="0 0 140 140"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="マスコットのトキ"
    >
      <defs>
        <linearGradient id={body} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--hero-from)" }} />
          <stop offset="1" style={{ stopColor: "var(--hero-to)" }} />
        </linearGradient>
        <radialGradient id={shine} cx="0.3" cy="0.25" r="0.6">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 影 */}
      <ellipse cx="70" cy="128" rx="34" ry="5" fill="rgb(var(--shadow-color) / 0.12)" />

      {/* 双葉 */}
      <path d="M70 26 C70 18 70 14 70 10" stroke="#16a974" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M70 14 C62 4 50 6 48 12 C56 18 64 18 70 14Z" fill="#2bc48a" />
      <path d="M70 12 C77 2 90 3 92 10 C84 17 76 16 70 12Z" fill="#16a974" />

      {/* 体（吹き出し） */}
      <path
        d="M34 26 H106 A24 24 0 0 1 130 50 V88 A24 24 0 0 1 106 112 H58 L38 126 L42 112 H34 A24 24 0 0 1 10 88 V50 A24 24 0 0 1 34 26Z"
        fill={`url(#${body})`}
      />
      <path
        d="M34 26 H106 A24 24 0 0 1 130 50 V88 A24 24 0 0 1 106 112 H58 L38 126 L42 112 H34 A24 24 0 0 1 10 88 V50 A24 24 0 0 1 34 26Z"
        fill={`url(#${shine})`}
      />

      {/* ほっぺ */}
      <ellipse cx="36" cy="80" rx="8" ry="5" fill="#ff8f73" opacity="0.7" />
      <ellipse cx="104" cy="80" rx="8" ry="5" fill="#ff8f73" opacity="0.7" />

      <Face mood={mood} />

      {mood === "listen" && (
        <g stroke="#ffffff" strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.9">
          <path d="M16 56 C8 64 8 76 16 84" />
          <path d="M124 56 C132 64 132 76 124 84" />
        </g>
      )}
      {mood === "think" && (
        <g fill="#ffffff">
          <circle cx="118" cy="18" r="4" />
          <circle cx="128" cy="8" r="2.6" />
        </g>
      )}
      {mood === "cheer" && (
        <g>
          <Sparkle x={8} y={16} size={14} color="#ffcf55" />
          <Sparkle x={118} y={22} size={12} color="#ff977a" />
        </g>
      )}
      {mood === "sleepy" && (
        <text x="112" y="30" fontSize="16" fontWeight="800" fill="var(--accent)">
          z
        </text>
      )}
    </svg>
  );
}

function Face({ mood }: { mood: Mood }) {
  switch (mood) {
    case "cheer":
      return (
        <g>
          {/* 笑顔の目（^ ^） */}
          <path d="M44 66 Q52 56 60 66" stroke={INK} strokeWidth="5" strokeLinecap="round" fill="none" />
          <path d="M80 66 Q88 56 96 66" stroke={INK} strokeWidth="5" strokeLinecap="round" fill="none" />
          <path d="M56 82 Q70 100 84 82 Z" fill={INK} />
          <path d="M62 90 Q70 96 78 90" fill="#ff8f73" />
        </g>
      );
    case "think":
      return (
        <g>
          <ellipse cx="52" cy="66" rx="9" ry="10" fill="#fff" />
          <ellipse cx="88" cy="66" rx="9" ry="10" fill="#fff" />
          <circle cx="55" cy="62" r="4.5" fill={INK} />
          <circle cx="91" cy="62" r="4.5" fill={INK} />
          <path d="M60 90 H80" stroke={INK} strokeWidth="4.5" strokeLinecap="round" />
        </g>
      );
    case "sleepy":
      return (
        <g>
          <path d="M44 68 H60" stroke={INK} strokeWidth="5" strokeLinecap="round" />
          <path d="M80 68 H96" stroke={INK} strokeWidth="5" strokeLinecap="round" />
          <ellipse cx="70" cy="88" rx="5" ry="4" fill={INK} />
        </g>
      );
    default:
      return (
        <g>
          <ellipse cx="52" cy="66" rx="9" ry="10.5" fill="#fff" />
          <ellipse cx="88" cy="66" rx="9" ry="10.5" fill="#fff" />
          <circle cx="53" cy="68" r="5" fill={INK} />
          <circle cx="89" cy="68" r="5" fill={INK} />
          <circle cx="55" cy="65.5" r="1.8" fill="#fff" />
          <circle cx="91" cy="65.5" r="1.8" fill="#fff" />
          <path d="M60 84 Q70 94 80 84" stroke={INK} strokeWidth="4.5" strokeLinecap="round" fill="none" />
        </g>
      );
  }
}

function Sparkle({ x = 0, y = 0, size = 16, color = "#ffcf55" }: { x?: number; y?: number; size?: number; color?: string }) {
  const s = size / 2;
  return (
    <path
      transform={`translate(${x + s} ${y + s})`}
      d={`M0 ${-s} C${s * 0.15} ${-s * 0.15} ${s * 0.15} ${-s * 0.15} ${s} 0 C${s * 0.15} ${s * 0.15} ${s * 0.15} ${s * 0.15} 0 ${s} C${-s * 0.15} ${s * 0.15} ${-s * 0.15} ${s * 0.15} ${-s} 0 C${-s * 0.15} ${-s * 0.15} ${-s * 0.15} ${-s * 0.15} 0 ${-s}Z`}
      fill={color}
    />
  );
}

/** 飾りの星（HTML 上に置く用） */
export function SparkleIcon({ size = 16, color = "var(--sun)", className = "" }: { size?: number; color?: string; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className={className} aria-hidden>
      <Sparkle size={16} color={color} />
    </svg>
  );
}

/** ヒーロー背景の有機的な形 */
export function Blobs({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 200" className={className} aria-hidden preserveAspectRatio="xMidYMid slice">
      <path d="M320 -20 C380 10 420 60 390 110 C360 160 300 140 270 100 C240 60 260 -50 320 -20Z" fill="#ffffff" opacity="0.10" />
      <path d="M-30 150 C0 110 60 120 80 160 C100 200 60 240 20 230 C-20 220 -60 190 -30 150Z" fill="#ffffff" opacity="0.08" />
      <circle cx="240" cy="30" r="6" fill="#ffffff" opacity="0.35" />
      <circle cx="360" cy="170" r="4" fill="#ffffff" opacity="0.3" />
      <circle cx="120" cy="24" r="3" fill="#ffffff" opacity="0.3" />
    </svg>
  );
}

/** 紙吹雪（達成したときの飾り） */
export function Confetti({ className = "" }: { className?: string }) {
  const bits = [
    { x: 8, y: 10, r: 18, c: "var(--coral)" },
    { x: 30, y: 4, r: -20, c: "var(--sun)" },
    { x: 52, y: 14, r: 40, c: "var(--mint)" },
    { x: 74, y: 6, r: -35, c: "var(--sky)" },
    { x: 92, y: 16, r: 10, c: "var(--accent)" },
    { x: 18, y: 26, r: 60, c: "var(--sky)" },
    { x: 64, y: 28, r: -10, c: "var(--coral)" },
    { x: 84, y: 30, r: 30, c: "var(--sun)" },
  ];
  return (
    <svg viewBox="0 0 100 36" className={className} aria-hidden>
      {bits.map((b, i) => (
        <rect key={i} x={b.x} y={b.y} width="5" height="2.6" rx="1.2" fill={b.c} transform={`rotate(${b.r} ${b.x} ${b.y})`} />
      ))}
      <circle cx="42" cy="8" r="1.6" fill="var(--accent)" />
      <circle cx="98" cy="4" r="1.4" fill="var(--mint)" />
      <circle cx="4" cy="30" r="1.5" fill="var(--sun)" />
    </svg>
  );
}

export type Tone = "accent" | "coral" | "mint" | "sun" | "sky";

/** 色味ごとの「淡い背景＋濃い文字」 */
export const TONES: Record<Tone, string> = {
  accent: "bg-accent-soft text-accent",
  coral: "bg-coral-soft text-coral",
  mint: "bg-mint-soft text-mint",
  sun: "bg-sun-soft text-warn",
  sky: "bg-sky-soft text-sky",
};

const SCENARIO_ART: Record<string, { icon: LucideIcon; tone: Tone }> = {
  diagnostic: { icon: Compass, tone: "accent" },
  "self-intro": { icon: BriefcaseBusiness, tone: "sky" },
  "status-report": { icon: ClipboardList, tone: "mint" },
  pushback: { icon: MessagesSquare, tone: "coral" },
  clarify: { icon: MessageCircleQuestion, tone: "sky" },
  negotiate: { icon: Handshake, tone: "sun" },
  "presentation-qa": { icon: Presentation, tone: "accent" },
  "small-talk": { icon: Coffee, tone: "coral" },
  "feedback-1on1": { icon: HeartHandshake, tone: "mint" },
  "free-talk": { icon: Lightbulb, tone: "sun" },
};

/** シナリオのアイコン（色付きの角丸タイル＋小さな飾り） */
export function ScenarioArt({ id, size = 56 }: { id: string; size?: number }) {
  const art = SCENARIO_ART[id] ?? { icon: MessagesSquare, tone: "accent" as Tone };
  const Icon = art.icon;
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center rounded-[30%] ${TONES[art.tone]}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Icon size={size * 0.46} strokeWidth={2.2} />
      <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-current opacity-40" />
    </span>
  );
}

