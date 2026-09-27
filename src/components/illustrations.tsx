/**
 * マークとアイコン。装飾は最小限にして、形と文字で見せる。
 * ロゴ: 墨色の吹き出しに朱色の点（話す／声の合図）。
 */
import {
  BriefcaseBusiness,
  ClipboardList,
  Coffee,
  Compass,
  Handshake,
  HeartHandshake,
  Lightbulb,
  MessageCircleQuestion,
  MessagesSquare,
  Presentation,
  type LucideIcon,
} from "lucide-react";

/** ロゴマーク */
export function Logo({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden>
      <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h15A1.5 1.5 0 0 1 21 4.5v11a1.5 1.5 0 0 1-1.5 1.5H10l-5 4v-4h-.5A1.5 1.5 0 0 1 3 15.5z" fill="var(--ink)" />
      <circle cx="15.5" cy="10" r="2.6" fill="var(--accent)" />
      <rect x="7" y="8.6" width="4.5" height="2.8" rx="1.4" fill="var(--ink-fg)" />
    </svg>
  );
}

export type Tone = "accent" | "coral" | "mint" | "sun" | "sky";

/** タグ用の「淡い地＋濃い文字」 */
export const TONES: Record<Tone, string> = {
  accent: "bg-accent-soft text-accent",
  coral: "bg-coral-soft text-coral",
  mint: "bg-mint-soft text-mint",
  sun: "bg-sun-soft text-warn",
  sky: "bg-sky-soft text-sky",
};

const SCENARIO_ICON: Record<string, LucideIcon> = {
  diagnostic: Compass,
  "self-intro": BriefcaseBusiness,
  "status-report": ClipboardList,
  pushback: MessagesSquare,
  clarify: MessageCircleQuestion,
  negotiate: Handshake,
  "presentation-qa": Presentation,
  "small-talk": Coffee,
  "feedback-1on1": HeartHandshake,
  "free-talk": Lightbulb,
};

/** シナリオのアイコン（細い枠に線画のアイコン） */
export function ScenarioArt({ id, size = 40, active = false }: { id: string; size?: number; active?: boolean }) {
  const Icon = SCENARIO_ICON[id] ?? MessagesSquare;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-lg border ${
        active ? "border-accent bg-accent text-accent-fg" : "border-line bg-surface text-fg"
      }`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Icon size={Math.round(size * 0.45)} strokeWidth={1.6} />
    </span>
  );
}
