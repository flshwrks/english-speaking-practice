"use client";

import { useState } from "react";

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
            className={`flex h-10 cursor-pointer items-center justify-center rounded-md border text-sm tabular-nums transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary ${
              n === value
                ? "border-primary bg-primary font-bold text-primary-fg"
                : n < value
                  ? "border-primary/20 bg-primary-soft text-primary"
                  : "border-line bg-surface text-fg-2 hover:border-line-strong"
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
