"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useRealtimeSession, type TurnWait } from "@/lib/client/use-realtime-session";
import { EXPRESSION_KIND_LABEL, type ExpressionKind } from "@/lib/categories";
import type { ExpressionPick } from "@/lib/expressions";

const TURN_WAIT_KEY = "esp-turn-wait";
const TURN_WAIT_OPTIONS: { value: TurnWait; label: string }[] = [
  { value: "manual", label: "手動" },
  { value: "low", label: "自動・長め" },
  { value: "medium", label: "自動・標準" },
];

/** 前回選んだ交代の方法（既定は「手動」: 何秒考えても割り込まれない） */
function loadTurnWait(): TurnWait {
  try {
    const v = localStorage.getItem(TURN_WAIT_KEY);
    return TURN_WAIT_OPTIONS.some((o) => o.value === v) ? (v as TurnWait) : "manual";
  } catch {
    return "manual";
  }
}

export function LiveSession({
  scenarioId,
  expressions,
  children,
}: {
  scenarioId: string;
  expressions: (ExpressionPick & { kind: ExpressionKind; text: string; meaning: string })[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { status, error, turns, maxMinutes, startedAt, start, end, endTurn, setTurnWait } = useRealtimeSession();
  const [turnWait, setTurnWaitState] = useState<TurnWait>(() => loadTurnWait());
  const [budgetBlocked, setBudgetBlocked] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const bottom = useRef<HTMLDivElement>(null);
  const ending = useRef(false);

  const elapsed = startedAt ? Math.floor((now - startedAt) / 1000) : 0;
  const remaining = maxMinutes * 60 - elapsed;

  const finish = async () => {
    if (ending.current) return;
    ending.current = true;
    const id = await end();
    router.push(`/session/${id}`);
  };

  useEffect(() => {
    if (status !== "live") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (status === "live" && remaining <= 0) void finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, status]);

  // 波かっこ必須: 新しいブラウザでは scrollIntoView が Promise を返し、それを後片付け関数として返すと React が落ちる
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length]);

  // スペースキーでも「話し終えた」
  useEffect(() => {
    if (status !== "live") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || (e.target as HTMLElement).closest("input, textarea, button")) return;
      e.preventDefault();
      endTurn();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, endTurn]);

  const changeTurnWait = (w: TurnWait) => {
    setTurnWaitState(w);
    setTurnWait(w);
    try {
      localStorage.setItem(TURN_WAIT_KEY, w);
    } catch {}
  };

  const begin = async (force = false) => {
    setBudgetBlocked(false);
    const r = await start(scenarioId, expressions.map(({ id, role }) => ({ id, role })), { force, turnWait });
    if (r.budgetExceeded) setBudgetBlocked(true);
  };

  if (status === "idle" || status === "error") {
    return (
      <>
        {children}
        <div className="sticky bottom-0 -mx-4 mt-6 border-t border-line bg-bg/95 px-4 py-4 backdrop-blur">
          {error && <p className="mb-2 text-sm text-bad">{error}</p>}
          {budgetBlocked ? (
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-bad">今月の予算上限に達しています。</p>
              <button className="btn self-start" onClick={() => begin(true)}>
                それでも始める
              </button>
            </div>
          ) : (
            <button className="btn-primary w-full py-3" onClick={() => begin()}>
              🎙 会話を始める（最大{maxMinutes}分）
            </button>
          )}
          <p className="mt-2 text-center text-xs text-muted">
            言い終えたら「話し終えた ▶」（PC はスペースキー）で AI の番になります。押すまでは、考え込んでも AI は待ちます。
            <br />
            AI の声をマイクが拾わないよう、イヤホンの使用をおすすめします
          </p>
        </div>
      </>
    );
  }

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;

  return (
    <div className="flex flex-col gap-4">
      <details className="card" open>
        <summary className="cursor-pointer text-sm font-medium">今日の表現</summary>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {expressions.map((e) => (
            <li key={e.id}>
              <span className="mr-1 text-xs text-muted">[{EXPRESSION_KIND_LABEL[e.kind]}]</span>
              <b>{e.text}</b> <span className="text-muted">— {e.meaning}</span>
            </li>
          ))}
        </ul>
      </details>

      <div className="flex min-h-[40vh] flex-col gap-3">
        {status === "connecting" && <p className="text-center text-muted">接続中…</p>}
        {turns.map((t) => (
          <div
            key={t.ref}
            className={`max-w-[85%] rounded-2xl px-4 py-2 ${
              t.role === "user" ? "self-end bg-accent text-accent-fg" : "self-start bg-surface"
            }`}
          >
            {t.text || <span className="opacity-60">…</span>}
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-3 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3 text-sm">
          <div className="tabular-nums">
            <span className={remaining < 60 ? "text-bad" : ""}>{mmss(elapsed)}</span>
            <span className="text-muted"> / {maxMinutes}:00</span>
            {status === "live" && <span className="ml-2 inline-block h-2 w-2 animate-pulse rounded-full bg-bad" />}
          </div>
          <div className="flex items-center gap-1" role="group" aria-label="AI に番を渡す方法">
            <span className="mr-1 hidden text-xs text-muted sm:inline">交代</span>
            {TURN_WAIT_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => changeTurnWait(o.value)}
                className={`btn px-2 py-1 text-xs ${turnWait === o.value ? "border-accent text-accent" : ""}`}
                aria-pressed={turnWait === o.value}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn-primary flex-1 py-3" onClick={endTurn} disabled={status !== "live"}>
            話し終えた ▶<span className="hidden text-xs opacity-80 sm:inline">（スペースキー）</span>
          </button>
          <button className="btn" onClick={finish} disabled={status !== "live"}>
            {status === "ending" ? "送信中…" : "終了"}
          </button>
        </div>
      </div>
    </div>
  );
}
