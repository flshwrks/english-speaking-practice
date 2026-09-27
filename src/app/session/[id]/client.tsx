"use client";

import { Check, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { loadUtterance, purgeOldUtterances } from "@/lib/client/audio-store";

export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}

const STEPS = ["発音と抑揚をチェック", "文法と言い回しを分析", "覚える表現をまとめる"];

/** 分析中の段階表示（実際の進み具合ではなく、待ち時間を退屈させないための演出） */
export function AnalyzingSteps() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), 9000);
    return () => clearInterval(timer);
  }, []);
  return (
    <ol className="mx-auto mt-6 w-full max-w-xs border-t border-line text-left">
      {STEPS.map((label, i) => (
        <li
          key={label}
          className={`flex items-center gap-3 border-b border-line py-2.5 text-sm transition-colors ${
            i === step ? "font-bold text-fg" : "text-muted"
          }`}
        >
          <span className="w-5 font-mono text-xs">
            {i < step ? <Check size={14} className="text-good" /> : String(i + 1).padStart(2, "0")}
          </span>
          {label}
          {i === step && <span className="ml-auto size-1.5 animate-blink rounded-full bg-accent" />}
        </li>
      ))}
    </ol>
  );
}

/** 端末に保存した自分の録音を再生する（別端末・30日経過後は表示しない） */
export function MyRecording({ sessionId, seq }: { sessionId: number; seq: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    let objectUrl: string | null = null;
    loadUtterance(sessionId, seq).then((blob) => {
      if (!blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sessionId, seq]);
  if (!url) return null;
  const play = () => {
    const audio = new Audio(url);
    audio.onended = () => setPlaying(false);
    setPlaying(true);
    void audio.play();
  };
  return (
    <button
      type="button"
      onClick={play}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors ${
        playing ? "border-fg bg-fg text-bg" : "border-line hover:border-line-strong"
      }`}
    >
      <Play size={12} className="fill-current" />
      自分の声
    </button>
  );
}

export function PurgeOldAudio() {
  useEffect(() => {
    void purgeOldUtterances();
  }, []);
  return null;
}
