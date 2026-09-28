"use client";

import { Loader2, Mic, Play, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DrillWord } from "@/db/schema";
import { loadUtterance } from "@/lib/client/audio-store";
import { toWav, UtteranceRecorder } from "@/lib/client/recorder";
import type { DrillResult } from "@/lib/drill";
import { formatPhoneme } from "@/lib/format";
import { Badge, scoreTone, type Tone } from "@/components/ui";

const MAX_SEC = 15; // サーバー側の DRILL_MAX_SEC と同じ
/** 停止を押してから最後の音がワークレットから届くまで待つ */
const TAIL_MS = 250;

const TONE_TEXT: Partial<Record<Tone, string>> = { good: "text-good", warn: "text-warn", accent: "text-accent" };

type Phase = "idle" | "starting" | "recording" | "scoring";

/**
 * 添削の「言い直す」: 改善後の文を声に出して、台本あり評価で採点する。
 * 結果には採点の印付きの文が出る（＝お手本が見える）ので、答えを隠す練習では結果が出てから答えを見せる側で使う。
 * original は会話中のその発話の発音スコア、best はこれまでの言い直しのベスト（なければ null）。
 */
export function RetryDrill({
  itemId,
  sessionId,
  seq,
  original,
  best: initialBest,
  onResult,
}: {
  itemId: number;
  sessionId: number;
  /** 会話中の自分の録音（端末内）と聞き比べるため。なければ null */
  seq: number | null;
  original: number | null;
  best: number | null;
  onResult?: (r: DrillResult) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<DrillResult | null>(null);
  const [best, setBest] = useState(initialBest);
  const [error, setError] = useState<string | null>(null);
  const [takeUrl, setTakeUrl] = useState<string | null>(null);
  const rec = useRef<{ stream: MediaStream; recorder: UtteranceRecorder; timer: number } | null>(null);

  const release = () => {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    clearInterval(r.timer);
    r.stream.getTracks().forEach((x) => x.stop());
    void r.recorder.close();
  };
  useEffect(() => release, []);
  useEffect(() => () => void (takeUrl && URL.revokeObjectURL(takeUrl)), [takeUrl]);

  const stop = async () => {
    const r = rec.current;
    if (!r) return;
    clearInterval(r.timer);
    setPhase("scoring");
    await new Promise((ok) => setTimeout(ok, TAIL_MS));
    const wav = toWav(r.recorder.slice(0, r.recorder.position));
    release();
    try {
      const res = await fetch(`/api/drill/${itemId}`, {
        method: "POST",
        headers: { "Content-Type": "audio/wav" },
        body: wav,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "採点に失敗しました");
      setResult(data);
      setBest(data.best);
      setTakeUrl(URL.createObjectURL(wav));
      onResult?.(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "採点に失敗しました");
    } finally {
      setPhase("idle");
    }
  };

  // マイクの許可と録音の開始は、このタップの中で行う（iOS Safari は操作の外では音声を始められない）
  const start = async () => {
    setError(null);
    setPhase("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const recorder = await UtteranceRecorder.create(stream);
      const began = Date.now();
      const timer = window.setInterval(() => {
        const sec = (Date.now() - began) / 1000;
        setElapsed(sec);
        if (sec >= MAX_SEC) void stop();
      }, 200);
      rec.current = { stream, recorder, timer };
      setElapsed(0);
      setPhase("recording");
    } catch {
      release();
      setPhase("idle");
      setError("マイクを使えません。ブラウザの設定でマイクを許可してください");
    }
  };

  const recording = phase === "recording";
  const busy = phase === "starting" || phase === "scoring";
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={recording ? stop : start}
          disabled={busy}
          aria-pressed={recording}
          className={`btn min-h-11 px-4 ${recording ? "border-accent text-accent hover:border-accent" : ""}`}
        >
          {busy ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              {phase === "scoring" ? "採点中…" : "準備中…"}
            </>
          ) : recording ? (
            <>
              <Square size={13} strokeWidth={2} className="fill-current" />
              <span className="tabular-nums">
                終了 {Math.floor(elapsed)}秒 / {MAX_SEC}秒
              </span>
            </>
          ) : (
            <>
              <Mic size={16} strokeWidth={1.75} />
              {result ? "もう一度" : "言い直す"}
            </>
          )}
        </button>
        {recording ? (
          <span className="meta inline-flex items-center gap-1.5">
            <span className="size-2 animate-pulse rounded-full bg-accent" aria-hidden />
            録音中。言い終えたらもう一度押す
          </span>
        ) : (
          best != null && <Badge tone={scoreTone(best)}>言い直し済み {Math.round(best)}</Badge>
        )}
      </div>
      <div aria-live="polite">
        {error && <p className="meta mt-2 text-accent">{error}</p>}
        {result && !error && (
          <DrillCard result={result} original={original} before={{ sessionId, seq }} takeUrl={takeUrl} />
        )}
      </div>
    </div>
  );
}

function DrillCard({
  result: { scores, words, best },
  original,
  before,
  takeUrl,
}: {
  result: DrillResult;
  original: number | null;
  before: { sessionId: number; seq: number | null };
  takeUrl: string | null;
}) {
  const weak = words.filter((w) => w.weakPhonemes.length > 0).slice(0, 3);
  const acc = scores.accuracy == null ? null : Math.round(scores.accuracy);
  const round = (v: number | null) => (v == null ? "—" : Math.round(v));
  const diff = acc != null && original != null ? acc - Math.round(original) : null;
  return (
    <div className="mt-3 rounded-[10px] border border-line px-3.5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2.5">
          <span
            className={`text-[22px] leading-none font-bold tabular-nums ${TONE_TEXT[scoreTone(scores.score)] ?? ""}`}
          >
            {Math.round(scores.score)}
          </span>
          <span className="meta tabular-nums">点 · ベスト {Math.round(best)}</span>
        </div>
        <div className="flex gap-2">
          <BeforeClip {...before} />
          {takeUrl && <PlayClip url={takeUrl} label="今回の声" />}
        </div>
      </div>
      <p className="mt-2 text-[16px] leading-loose">
        {words.map((w, i) => (
          <span key={i}>
            {i > 0 && " "}
            <DrillMark w={w} />
          </span>
        ))}
      </p>
      <p className="meta mt-1 tabular-nums">
        発音 {acc ?? "—"}
        {diff != null && `（会話中 ${Math.round(original!)} から ${diff >= 0 ? "+" : ""}${diff}）`} · 流暢さ{" "}
        {round(scores.fluency)} · 抑揚 {round(scores.prosody)} · 言えた語 {scores.completeness}%
      </p>
      {weak.length > 0 && (
        <ul className="meta mt-1 flex flex-col gap-0.5">
          {weak.map((w, i) => (
            <li key={i} className="tabular-nums">
              <b className="font-medium text-fg">{w.word}</b> {w.weakPhonemes.map(formatPhoneme).join(" ")}
            </li>
          ))}
        </ul>
      )}
      <p className="meta mt-1">点線＝やや不明瞭、実線＝聞き取りにくい、取り消し線＝抜けた語、＋＝言い足した語</p>
    </div>
  );
}

/** 会話中の自分の録音（端末の IndexedDB。別端末・30日経過後はないので出さない） */
export function BeforeClip({ sessionId, seq }: { sessionId: number; seq: number | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (seq == null) return;
    let objectUrl: string | null = null;
    void loadUtterance(sessionId, seq).then((blob) => {
      if (!blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sessionId, seq]);
  return url && <PlayClip url={url} label="会話中の声" />;
}

function PlayClip({ url, label }: { url: string; label: string }) {
  const [playing, setPlaying] = useState(false);
  const play = () => {
    const audio = new Audio(url);
    audio.onended = () => setPlaying(false);
    setPlaying(true);
    void audio.play().catch(() => setPlaying(false));
  };
  return (
    <button
      type="button"
      onClick={play}
      className={`btn min-h-9 px-2.5 py-1 text-[13px] ${playing ? "bg-sunken" : ""}`}
    >
      <Play size={12} strokeWidth={2} className="fill-current" />
      {label}
    </button>
  );
}

/** 語の印はフィードバック画面の「発音の詳細」と同じ（点線=やや不明瞭・朱の実線=聞き取りにくい） */
function DrillMark({ w }: { w: DrillWord }) {
  if (w.errorType === "Omission")
    return (
      <span className="text-muted line-through decoration-accent decoration-[1.5px]">
        {w.word}
        <span className="sr-only">（抜け）</span>
      </span>
    );
  if (w.errorType === "Insertion")
    return (
      <span className="text-[14px] text-muted">
        ＋{w.word}
        <span className="sr-only">（言い足し）</span>
      </span>
    );
  const acc = w.accuracy ?? 0;
  return (
    <span
      title={`${Math.round(acc)}点 ${w.weakPhonemes.map(formatPhoneme).join(" ")}`}
      className={
        acc < 65
          ? "rounded-sm bg-accent-soft underline decoration-accent decoration-[1.5px] underline-offset-4"
          : acc < 85
            ? "underline decoration-warn decoration-dotted decoration-[1.5px] underline-offset-4"
            : ""
      }
    >
      {w.word}
      {acc < 85 && <span className="sr-only">（{Math.round(acc)}点）</span>}
    </span>
  );
}
