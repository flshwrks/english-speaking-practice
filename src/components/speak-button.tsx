"use client";

import { Volume2 } from "lucide-react";
import { useState } from "react";
import { plainExpressionText } from "@/lib/format";

/** ブラウザ内蔵の音声合成でお手本を読み上げる（API 費用なし） */
export function SpeakButton({ text, label = "お手本" }: { text: string; label?: string }) {
  const [playing, setPlaying] = useState(false);
  const speak = () => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(plainExpressionText(text, "something"));
    u.lang = "en-US";
    u.rate = 0.95;
    const voice = synth.getVoices().find((v) => v.lang === "en-US" && /natural|google|samantha/i.test(v.name));
    if (voice) u.voice = voice;
    u.onend = () => setPlaying(false);
    u.onerror = () => setPlaying(false);
    setPlaying(true);
    synth.speak(u);
  };
  return (
    <button
      type="button"
      onClick={speak}
      aria-label="お手本を再生"
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors ${
        playing ? "border-accent bg-accent text-accent-fg" : "border-line text-fg hover:border-line-strong"
      }`}
    >
      <Volume2 size={14} strokeWidth={2} />
      {label}
    </button>
  );
}
