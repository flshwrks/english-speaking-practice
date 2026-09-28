import { diffWords, isRewrite } from "@/lib/typeset";

/**
 * 赤ペン添削: 残す語はそのまま、消す語に線、足す語は太字。
 * 「より良い言い方」（upgrade）は朱を使わず控えめに。ほぼ全部入れ替えなら元の文と新しい文を2行に分ける
 * （元の文が上に出ている画面では hideOriginal で新しい文だけにする）。
 */
export function Correction({
  original,
  improved,
  upgrade,
  hideOriginal = false,
}: {
  original: string;
  improved: string;
  upgrade: boolean;
  hideOriginal?: boolean;
}) {
  const parts = diffWords(original, improved);
  const del = upgrade
    ? "text-muted line-through decoration-muted"
    : "text-fg-2 line-through decoration-accent decoration-[1.5px]";
  const ins = upgrade
    ? "font-bold underline decoration-line-strong underline-offset-4"
    : "rounded-sm bg-accent-soft px-0.5 font-bold";
  if (isRewrite(parts)) {
    return (
      <div className="min-w-0 text-[17px] leading-relaxed">
        {!hideOriginal && <p className={del}>{original}</p>}
        <p className={hideOriginal ? "font-bold" : "mt-0.5 font-bold"}>{improved}</p>
      </div>
    );
  }
  return (
    <p className="min-w-0 text-[17px] leading-relaxed">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && " "}
          <span className={p.op === "del" ? del : p.op === "ins" ? ins : ""}>{p.text}</span>
        </span>
      ))}
    </p>
  );
}
