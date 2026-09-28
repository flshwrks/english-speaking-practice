import type { ScenarioCard } from "@/db/schema";

/**
 * お題カードの表示。準備画面では枠つきで全部、会話中（compact）は右の欄やシートに要点だけ。
 * 役と事実はカードで決まっているので、学習者は作り話をせずに話せる
 */
export function ScenarioCardView({
  card,
  compact = false,
  label = "今回のお題",
  children,
}: {
  card: ScenarioCard;
  compact?: boolean;
  label?: string;
  children?: React.ReactNode;
}) {
  const body = (
    <>
      <p className="text-[13px] font-bold text-primary">{label}</p>
      <h2 className={`mt-0.5 leading-snug font-bold ${compact ? "text-[15px]" : "text-[17px]"}`}>{card.title}</h2>
      {!compact && <p className="mt-1.5 text-fg-2">{card.situation}</p>}
      <dl className={`flex flex-col gap-2 ${compact ? "mt-2 text-sm" : "mt-4 text-[15px]"}`}>
        <div>
          <dt className="meta">あなたの役</dt>
          <dd className="font-medium">{card.role ?? "あなた自身（大学生）として話します"}</dd>
        </div>
        <div>
          <dt className="meta">{card.role ? "使える事実" : "話の材料"}</dt>
          <dd>
            <ul className="mt-0.5 flex flex-col gap-1">
              {card.facts.map((f) => (
                <li
                  key={f}
                  className="relative pl-3.5 before:absolute before:top-[0.7em] before:left-0 before:size-1 before:rounded-full before:bg-line-strong"
                >
                  {f}
                </li>
              ))}
            </ul>
          </dd>
        </div>
        <div>
          <dt className="meta">ゴール</dt>
          <dd className="font-medium">{card.goal}</dd>
        </div>
      </dl>
      {children}
    </>
  );
  return compact ? <div>{body}</div> : <section className="panel px-5 py-4">{body}</section>;
}
