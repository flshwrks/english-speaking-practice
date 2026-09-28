"use client";

import { Ellipsis, Eye } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMounted, usePref } from "@/components/use-pref";
import type { TurnWait } from "@/lib/client/use-realtime-session";

export const TURN_WAIT_OPTIONS: { value: TurnWait; label: string; note: string }[] = [
  { value: "manual", label: "手動", note: "「話し終えた」を押すまで待つ" },
  { value: "low", label: "自動・長め", note: "長めの沈黙で交代" },
  { value: "medium", label: "自動・標準", note: "ふつうの沈黙で交代" },
];

export const LENGTHS = ["5", "10", "15"] as const;
/** 会話の長さ（分）。端末ごとに前回の選択を覚える */
export const useSessionLength = () => usePref("esp-session-minutes", LENGTHS, "15");

/** 聞き取りモード: 相手の英語を文字で出さず、耳で聞く。端末ごとに覚える */
export function useListenMode() {
  const [v, set] = usePref("esp-listen-mode", ["on", "off"] as const, "off");
  return [v === "on", (on: boolean) => set(on ? "on" : "off")] as const;
}

/** 3〜4択の切り替え（準備画面の設定）。保存値はサーバー描画では読めないので、読み込み後に選択を出す */
export function Segmented<T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: { value: T; label: string; note?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const mounted = useMounted();
  const note = options.find((o) => o.value === value)?.note;
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-bold">{legend}</legend>
      <div className="grid auto-cols-fr grid-flow-col rounded-[10px] bg-sunken p-0.5">
        {options.map((o) => {
          const on = mounted && value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              aria-pressed={on}
              className={`min-h-9 rounded-lg py-1.5 text-[13px] transition-colors ${
                on ? "bg-surface font-bold text-primary shadow-card ring-1 ring-line" : "text-fg-2 hover:text-fg"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {note && <p className="meta mt-1.5">{mounted ? note : " "}</p>}
    </fieldset>
  );
}

/** オン・オフの切り替え（行全体が押せる） */
export function Switch({
  label,
  note,
  checked,
  onChange,
}: {
  label: string;
  note: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary">
      <span>
        <span className="block text-sm font-bold">{label}</span>
        <span className="meta block">{note}</span>
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className="relative mt-0.5 h-6 w-10 shrink-0 rounded-full bg-line-strong transition-colors peer-checked:bg-primary after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-surface after:shadow-card after:transition-transform peer-checked:after:translate-x-4"
      />
    </label>
  );
}

/** 会話中の「…」: 番を渡す方法と聞き取りモード */
export function SessionMenu({
  turnWait,
  onTurnWait,
  listen,
  onListen,
}: {
  turnWait: TurnWait;
  onTurnWait: (v: TurnWait) => void;
  listen: boolean;
  onListen: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="relative">
      <button
        className="btn-ghost px-2"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="会話の設定"
      >
        <Ellipsis size={18} strokeWidth={1.75} />
      </button>
      {open && (
        <>
          <button className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} aria-label="閉じる" />
          <div className="absolute top-full right-0 z-50 mt-1 w-72 rounded-[12px] border border-line bg-surface p-1.5 shadow-float">
            <p className="meta px-2.5 pt-1 pb-1.5">AI に番を渡す方法</p>
            {TURN_WAIT_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => {
                  onTurnWait(o.value);
                  setOpen(false);
                }}
                aria-pressed={turnWait === o.value}
                className={`flex w-full flex-col items-start rounded-lg px-2.5 py-2 text-left hover:bg-sunken ${
                  turnWait === o.value ? "bg-sunken" : ""
                }`}
              >
                <span className={`text-sm ${turnWait === o.value ? "font-bold" : ""}`}>{o.label}</span>
                <span className="meta">{o.note}</span>
              </button>
            ))}
            <div className="mt-1.5 border-t border-line px-2.5 pt-3 pb-2">
              <Switch label="聞き取りモード" note="相手の英語を文字で出さない" checked={listen} onChange={onListen} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** 見出し語のヒント: 最初の語だけ見せる（1語なら頭文字だけ） */
const hintOf = (text: string) => {
  const words = text.trim().split(/\s+/);
  return words.length > 1 ? `${words[0]} …` : `${text.trim()[0]}…`;
};

/**
 * 会話中の今日の表現。見ながら読むのではなく思い出して使えるよう、意味とヒントだけを出し、押すと英語を見せる。
 */
export function TargetHints({
  items,
  shown,
  onShow,
}: {
  items: { id: number; text: string; meaning: string }[];
  /** 答えを見た表現（PC の欄とスマホのシートで共有するため親が持つ） */
  shown: Set<number>;
  onShow: (id: number) => void;
}) {
  return (
    <>
      <p className="meta mt-0.5">意味から英語を思い出してみましょう。押すと答えが出ます。</p>
      <ul className="mt-1 divide-y divide-line">
        {items.map((e) => {
          const open = shown.has(e.id);
          return (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onShow(e.id)}
                disabled={open}
                aria-label={open ? undefined : `${e.meaning}（押すと英語を表示）`}
                className="-mx-2 block w-[calc(100%+1rem)] rounded-lg px-2 py-3 text-left transition-colors enabled:hover:bg-sunken disabled:cursor-default"
              >
                <span className="block text-[15px] leading-snug font-medium">{e.meaning}</span>
                {open ? (
                  <span className="mt-0.5 block text-[15px] leading-snug font-bold">{e.text}</span>
                ) : (
                  <span className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
                    <span className="tracking-wide">{hintOf(e.text)}</span>
                    <Eye size={14} strokeWidth={1.75} aria-hidden />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** 相手の発言。聞き取りモードでは文字を伏せ、押すとその発言だけ見せる */
export function AssistantTurn({ partner, text, listen }: { partner: string; text: string; listen: boolean }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="max-w-[88%] self-start">
      <div className="meta mb-0.5">{partner}</div>
      {!text ? (
        <TypingDots />
      ) : listen && !revealed ? (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="inline-flex items-center gap-2 rounded-[10px] border border-dashed border-line-strong px-3 py-2 text-sm text-fg-2 transition-colors hover:bg-sunken"
        >
          <Eye size={15} strokeWidth={1.75} />
          聞き取れなかったら文字を見る
        </button>
      ) : (
        <p className="text-[17px] leading-relaxed">{text}</p>
      )}
    </div>
  );
}

export function Breathing() {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-blink rounded-full bg-fg-2"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </span>
  );
}

export function TypingDots({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label="入力中">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`size-1 animate-blink rounded-full ${light ? "bg-primary-fg" : "bg-muted"}`}
          style={{ animationDelay: `${i * 0.18}s` }}
        />
      ))}
    </span>
  );
}

/** マイクの音量を5本のバーで表示する（描画はブラウザの描画周期ごとに直接更新） */
export function MicMeter({ getLevel }: { getLevel: () => number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    let smooth = 0;
    let drawn = -1;
    const tick = () => {
      smooth = smooth * 0.7 + getLevel() * 0.3;
      const bars = ref.current?.children;
      // 見た目が変わらないほどの変化なら描き直さない
      if (bars && Math.abs(smooth - drawn) > 0.02) {
        drawn = smooth;
        for (let i = 0; i < bars.length; i++) {
          const h = Math.max(0.2, Math.min(1, smooth * (1.4 - Math.abs(i - 2) * 0.25) + ((i * 7) % 3) * 0.02));
          (bars[i] as HTMLElement).style.transform = `scaleY(${h})`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getLevel]);
  return (
    <span ref={ref} className="inline-flex h-4 items-center gap-[3px]" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="h-4 w-[3px] origin-center rounded-full bg-accent" />
      ))}
    </span>
  );
}
