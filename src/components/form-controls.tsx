"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useFormStatus } from "react-dom";

const LEVEL_TEXT = [
  { max: 3, label: "やさしい", note: "ゆっくり・短い文・かんたんな単語" },
  { max: 5, label: "ふつう", note: "はっきりした話し方・慣用句は控えめ" },
  { max: 7, label: "ナチュラル", note: "自然な速さ・よく使う慣用句あり" },
  { max: 10, label: "エグゼクティブ", note: "速く濃い語彙・強めの反論" },
];

/** 会話の難易度（1〜10）。10段のボタンで選び、選んだ段の説明をその場で出す */
export function LevelPicker({ name, defaultValue }: { name: string; defaultValue: number }) {
  const [value, setValue] = useState(defaultValue);
  const band = LEVEL_TEXT.find((b) => value <= b.max) ?? LEVEL_TEXT[LEVEL_TEXT.length - 1];
  return (
    <fieldset>
      <legend className="sr-only">会話の難易度</legend>
      <div className="grid grid-cols-10 gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <label
            key={n}
            className={`flex h-10 cursor-pointer items-center justify-center rounded-md border text-sm tabular-nums transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-fg ${
              n === value
                ? "border-fg bg-fg font-bold text-bg"
                : n < value
                  ? "border-line-strong bg-sunken text-fg-2"
                  : "border-line text-fg-2 hover:border-line-strong"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={n}
              checked={n === value}
              onChange={() => setValue(n)}
              className="sr-only"
            />
            {n}
          </label>
        ))}
      </div>
      <p className="mt-2 text-sm">
        <b>
          {value} {band.label}
        </b>
        <span className="text-fg-2"> — {band.note}</span>
      </p>
    </fieldset>
  );
}

/** 送信中は「保存中…」に変わる保存ボタン */
export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary min-w-28" disabled={pending}>
      {pending && <Loader2 size={16} className="animate-spin" />}
      {pending ? "保存中…" : children}
    </button>
  );
}
