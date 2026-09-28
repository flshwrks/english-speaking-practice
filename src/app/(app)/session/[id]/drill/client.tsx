"use client";

import { ChevronRight, Eye, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Correction } from "@/components/correction";
import { BeforeClip, RetryDrill } from "@/components/retry-drill";
import { SpeakButton } from "@/components/speak-button";
import { Badge, Meter, scoreTone } from "@/components/ui";

export type DrillItem = {
  id: number;
  seq: number | null;
  /** 「直したい点 · 文法」など */
  label: string;
  upgrade: boolean;
  original: string;
  improved: string;
  /** 手がかりに出す解説（答えがそのまま入っているときは null） */
  cue: string | null;
  originalScore: number | null;
  best: number | null;
};

/** 添削を1件ずつ: 手がかり → 録音・採点 → お手本を見せる。最後に結果のまとめ */
export function DrillRunner({
  sessionId,
  items,
  clearScore,
}: {
  sessionId: number;
  items: DrillItem[];
  clearScore: number;
}) {
  const [index, setIndex] = useState(0);
  const [best, setBest] = useState(() => new Map(items.map((it) => [it.id, it.best])));
  const [revealed, setRevealed] = useState(false);

  if (index >= items.length) {
    return (
      <Summary
        sessionId={sessionId}
        items={items}
        best={best}
        clearScore={clearScore}
        restart={() => {
          setIndex(0);
          setRevealed(false);
        }}
      />
    );
  }

  const it = items[index];
  const last = index === items.length - 1;
  const next = () => {
    setIndex(index + 1);
    setRevealed(false);
    window.scrollTo({ top: 0 });
  };
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <span className="meta shrink-0 tabular-nums">
          {index + 1} / {items.length}
        </span>
        <div className="flex-1">
          <Meter value={index / items.length} />
        </div>
      </div>

      <section className="panel px-4 py-5 sm:px-6" aria-labelledby="drill-prompt">
        <div className="meta mb-2">{it.label}</div>
        <div className="meta">会話中のあなた</div>
        <div className="mt-0.5 flex items-start justify-between gap-3">
          <p className="text-[17px] leading-relaxed text-fg-2">{it.original}</p>
          <BeforeClip sessionId={sessionId} seq={it.seq} />
        </div>
        {it.cue && (
          <p className="mt-3 max-w-[38em] text-[15px] text-fg-2">
            <span className="mr-2 text-xs font-bold text-primary">ヒント</span>
            {it.cue}
          </p>
        )}
        <p id="drill-prompt" className="mt-4 font-bold">
          直した言い方を思い出して、声に出して言う
        </p>
        <RetryDrill
          key={it.id}
          itemId={it.id}
          sessionId={sessionId}
          seq={it.seq}
          original={it.originalScore}
          best={best.get(it.id) ?? null}
          onResult={(r) => {
            setBest((m) => new Map(m).set(it.id, r.best));
            setRevealed(true);
          }}
        />
        {revealed && (
          <div className="mt-5 border-t border-line pt-4">
            <div className="meta mb-1">お手本</div>
            <div className="flex items-start justify-between gap-4">
              <Correction original={it.original} improved={it.improved} upgrade={it.upgrade} hideOriginal />
              <SpeakButton text={it.improved} />
            </div>
          </div>
        )}
      </section>

      <div className="mt-4 flex items-center justify-between gap-3">
        {revealed ? (
          <span />
        ) : (
          <button type="button" onClick={() => setRevealed(true)} className="btn-ghost min-h-11">
            <Eye size={16} strokeWidth={1.75} />
            答えを見る
          </button>
        )}
        <button type="button" onClick={next} className={`min-h-11 ${revealed ? "btn-primary" : "btn"}`}>
          {last ? "結果を見る" : revealed ? "次へ" : "スキップ"}
          <ChevronRight size={16} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

function Summary({
  sessionId,
  items,
  best,
  clearScore,
  restart,
}: {
  sessionId: number;
  items: DrillItem[];
  best: Map<number, number | null>;
  clearScore: number;
  restart: () => void;
}) {
  const scores = items.map((it) => best.get(it.id)).filter((v) => v != null);
  const cleared = scores.filter((v) => v >= clearScore).length;
  const avg = scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : null;
  return (
    <section className="panel px-4 py-6 sm:px-6" aria-live="polite">
      <h2 className="text-[17px] font-bold">結果</h2>
      <p className="mt-1 text-fg-2 tabular-nums">
        {clearScore}点以上 <b className="text-fg">{cleared}</b> / {items.length}問 · 平均（ベスト）{" "}
        <b className="text-fg">{avg ?? "—"}</b> · 挑戦 {scores.length}問
      </p>
      <ul className="mt-5 divide-y divide-line border-y border-line">
        {items.map((it) => {
          const v = best.get(it.id);
          return (
            <li key={it.id} className="flex items-start justify-between gap-3 py-2.5">
              <span className="min-w-0 text-[15px]">{it.improved}</span>
              {v == null ? <Badge>未挑戦</Badge> : <Badge tone={scoreTone(v)}>{Math.round(v)}</Badge>}
            </li>
          );
        })}
      </ul>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={restart} className="btn min-h-11">
          <RotateCcw size={15} strokeWidth={1.75} />
          最初からもう一度
        </button>
        <Link href={`/session/${sessionId}`} className="btn-primary min-h-11">
          フィードバックに戻る
        </Link>
      </div>
    </section>
  );
}
