"use client";

import { Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { useFormStatus } from "react-dom";

const LEVEL_TEXT = [
  { max: 3, label: "やさしい", note: "ゆっくり・短い文・かんたんな単語" },
  { max: 5, label: "ふつう", note: "はっきりした話し方・慣用句は控えめ" },
  { max: 7, label: "ナチュラル", note: "自然な速さ・よく使う慣用句あり" },
  { max: 10, label: "エグゼクティブ", note: "速く濃い語彙・強めの反論" },
];

/** 会話の難易度（1〜10）のスライダー。値と説明をその場で表示する */
export function LevelSlider({ name, defaultValue }: { name: string; defaultValue: number }) {
  const [value, setValue] = useState(defaultValue);
  const band = LEVEL_TEXT.find((b) => value <= b.max) ?? LEVEL_TEXT[LEVEL_TEXT.length - 1];
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <div className="text-lg font-extrabold">
            {band.label}
            <span className="ml-2 text-sm text-muted tabular-nums">{value} / 10</span>
          </div>
          <div className="text-xs text-muted">{band.note}</div>
        </div>
      </div>
      <input
        type="range"
        name={name}
        min={1}
        max={10}
        step={1}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="w-full accent-[var(--accent)]"
        aria-label="会話の難易度"
      />
      <div className="mt-1 flex justify-between text-[10px] font-bold text-muted">
        <span>1</span>
        <span>5</span>
        <span>10</span>
      </div>
    </div>
  );
}

/** 送信中は「保存中…」に変わる保存ボタン */
export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" disabled={pending}>
      {pending ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} strokeWidth={2.8} />}
      {pending ? "保存中…" : children}
    </button>
  );
}
