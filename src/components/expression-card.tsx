import { SpeakButton } from "./speak-button";
import {
  EXPRESSION_CATEGORY_LABEL,
  EXPRESSION_KIND_LABEL,
  REGISTER_LABEL,
  type ExpressionCategory,
  type ExpressionKind,
  type Register,
} from "@/lib/categories";
import { splitHeadword } from "@/lib/typeset";

type Entry = {
  text: string;
  meaning: string;
  example: string;
  scene: string;
  category: ExpressionCategory;
  register: Register;
  kind: ExpressionKind;
};

/** 例文。見出し語に当たる部分に下線を引く（辞書の用例のように） */
function Example({ text, headword }: { text: string; headword: string }) {
  return (
    <p className="font-serif text-[16px] leading-relaxed text-fg italic">
      {splitHeadword(text, headword).map((p, i) =>
        p.hit ? (
          <span key={i} className="underline decoration-fg decoration-[1.5px] underline-offset-[3px]">
            {p.text}
          </span>
        ) : (
          p.text
        ),
      )}
    </p>
  );
}

function metaLine(e: Entry) {
  return [EXPRESSION_KIND_LABEL[e.kind], EXPRESSION_CATEGORY_LABEL[e.category], REGISTER_LABEL[e.register]]
    .filter(Boolean)
    .join(" · ");
}

/**
 * 表現を辞書の項目のように組む。
 * - stack: 見出し語 → 意味 → 用例（縦に）
 * - row: PC では「見出し語と意味 | 用例 | 操作」の3列、スマホでは縦に
 */
export function ExpressionEntry({
  e,
  status,
  statusAccent = false,
  layout = "stack",
  children,
}: {
  e: Entry;
  status?: string;
  statusAccent?: boolean;
  layout?: "stack" | "row";
  children?: React.ReactNode;
}) {
  const head = (
    <div className="min-w-0">
      <div className="text-[17px] leading-snug font-bold">{e.text}</div>
      <div className="mt-0.5 text-fg-2">{e.meaning}</div>
      <div className="meta mt-1">
        {status && <span className={statusAccent ? "font-medium text-accent" : ""}>{status} · </span>}
        {metaLine(e)}
      </div>
    </div>
  );
  const example = (e.example || e.scene) && (
    <div className="min-w-0">
      {e.example && <Example text={e.example} headword={e.text} />}
      {e.scene && <p className="meta mt-0.5">{e.scene}</p>}
    </div>
  );

  if (layout === "row") {
    return (
      <div className="grid gap-3 py-5 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)_auto] lg:gap-8">
        <div className="flex items-start justify-between gap-3">
          {head}
          <span className="lg:hidden">
            <SpeakButton text={e.example || e.text} />
          </span>
        </div>
        {example || <span />}
        <div className="flex items-start gap-2 lg:justify-end">
          <span className="hidden lg:inline-flex">
            <SpeakButton text={e.example || e.text} />
          </span>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 py-5">
      <div className="flex items-start justify-between gap-4">
        {head}
        <SpeakButton text={e.example || e.text} />
      </div>
      {example}
      {children}
    </div>
  );
}
