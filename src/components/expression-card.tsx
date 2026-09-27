import { SpeakButton } from "./speak-button";
import { Badge } from "./ui";
import {
  EXPRESSION_CATEGORY_LABEL,
  EXPRESSION_KIND_LABEL,
  REGISTER_LABEL,
  type ExpressionCategory,
  type ExpressionKind,
  type Register,
} from "@/lib/categories";
import type { Tone } from "./illustrations";

export const KIND_TONE: Record<ExpressionKind, Tone> = { phrase: "sky", word: "coral" };

export function ExpressionCard({
  e,
  badge,
  badgeTone = "mint",
  children,
}: {
  e: {
    text: string;
    meaning: string;
    example: string;
    scene: string;
    category: ExpressionCategory;
    register: Register;
    kind: ExpressionKind;
  };
  badge?: string;
  badgeTone?: Tone;
  children?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={KIND_TONE[e.kind]}>{EXPRESSION_KIND_LABEL[e.kind]}</Badge>
            {badge && <Badge tone={badgeTone}>{badge}</Badge>}
            <span className="text-xs text-muted">
              {EXPRESSION_CATEGORY_LABEL[e.category]}
              {REGISTER_LABEL[e.register] && `・${REGISTER_LABEL[e.register]}`}
            </span>
          </div>
          <div className="mt-3 text-xl leading-snug font-bold tracking-tight">{e.text}</div>
          <div className="mt-1 text-sm text-muted">{e.meaning}</div>
        </div>
        <SpeakButton text={e.example || e.text} />
      </div>
      {(e.example || e.scene) && (
        <div className="border-l-2 border-line-strong pl-3.5">
          {e.example && <p className="font-serif text-[17px] leading-snug italic">{e.example}</p>}
          {e.scene && <p className="mt-1 text-xs text-muted">{e.scene}</p>}
        </div>
      )}
      {children}
    </div>
  );
}
