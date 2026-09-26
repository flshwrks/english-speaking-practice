import { SpeakButton } from "./speak-button";
import { EXPRESSION_CATEGORY_LABEL, REGISTER_LABEL, type ExpressionCategory, type Register } from "@/lib/categories";

export function ExpressionCard({
  e,
  badge,
  children,
}: {
  e: { text: string; meaning: string; example: string; scene: string; category: ExpressionCategory; register: Register };
  badge?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            {badge && <span className="rounded bg-accent-soft px-1.5 py-0.5 text-accent">{badge}</span>}
            <span>{EXPRESSION_CATEGORY_LABEL[e.category]}</span>
            {REGISTER_LABEL[e.register] && <span>・{REGISTER_LABEL[e.register]}</span>}
            {e.scene && <span>・{e.scene}</span>}
          </div>
          <div className="mt-1 font-semibold">{e.text}</div>
          <div className="text-sm text-muted">{e.meaning}</div>
        </div>
        <SpeakButton text={e.example || e.text} />
      </div>
      {e.example && <div className="text-sm italic">“{e.example}”</div>}
      {children}
    </div>
  );
}
