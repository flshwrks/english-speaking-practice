"use client";

import { AudioLines, BookOpenCheck, Check, Loader2, Play, ScanText } from "lucide-react";
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

const STEPS = [
  { icon: AudioLines, label: "発音と抑揚をチェック" },
  { icon: ScanText, label: "文法と言い回しを分析" },
  { icon: BookOpenCheck, label: "覚える表現をまとめる" },
];

/** 分析中の段階表示（実際の進み具合ではなく、待ち時間を退屈させないための演出） */
export function AnalyzingSteps() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), 9000);
    return () => clearInterval(timer);
  }, []);
  return (
    <ol className="mx-auto mt-5 flex w-full max-w-xs flex-col gap-2 text-left">
      {STEPS.map(({ icon: Icon, label }, i) => (
        <li
          key={label}
          className={`flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-bold transition ${
            i === step ? "bg-accent-soft text-accent" : i < step ? "text-mint" : "text-muted"
          }`}
        >
          <span className="inline-flex size-7 items-center justify-center rounded-full bg-surface shadow-[var(--shadow-soft)]">
            {i < step ? (
              <Check size={15} strokeWidth={3} />
            ) : i === step ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Icon size={15} />
            )}
          </span>
          {label}
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
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-bold transition active:scale-95 ${
        playing ? "bg-coral text-white" : "bg-coral-soft text-coral"
      }`}
    >
      <Play size={13} strokeWidth={2.6} className="fill-current" />
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
