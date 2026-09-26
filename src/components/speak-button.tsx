"use client";

/** ブラウザ内蔵の音声合成でお手本を読み上げる（API 費用なし） */
export function SpeakButton({ text }: { text: string }) {
  const speak = () => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/_{2,}/g, "something"));
    u.lang = "en-US";
    u.rate = 0.95;
    const voice = synth.getVoices().find((v) => v.lang === "en-US" && /natural|google|samantha/i.test(v.name));
    if (voice) u.voice = voice;
    synth.speak(u);
  };
  return (
    <button type="button" onClick={speak} className="btn shrink-0 px-2 py-1 text-xs">
      ▶ お手本
    </button>
  );
}
