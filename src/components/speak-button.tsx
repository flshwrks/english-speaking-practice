"use client";

import { Pause, Play } from "lucide-react";
import { useState } from "react";
import { plainExpressionText } from "@/lib/format";

/** ブラウザ内蔵の音声合成でお手本を読み上げる（API 費用なし）。既定は丸い再生ボタン */
export function SpeakButton({ text, label }: { text: string; label?: string }) {
  const [playing, setPlaying] = useState(false);
  const speak = () => {
    const synth = window.speechSynthesis;
    synth.cancel();
    if (playing) return setPlaying(false);
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
  const Icon = playing ? Pause : Play;
  const icon = <Icon size={14} strokeWidth={2} className={playing ? "" : "translate-x-px fill-current"} />;
  return label ? (
    <button type="button" onClick={speak} className="btn px-2.5 text-[13px]" aria-label="お手本を再生">
      {icon}
      {label}
    </button>
  ) : (
    <button
      type="button"
      onClick={speak}
      aria-label="お手本を再生"
      title="お手本を再生"
      className={`btn-round ${playing ? "border-fg bg-fg text-bg hover:bg-fg" : ""}`}
    >
      {icon}
    </button>
  );
}
