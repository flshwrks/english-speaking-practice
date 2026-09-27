"use client";

import { CornerDownLeft, Headphones, Mic, Square, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { KIND_TONE } from "@/components/expression-card";
import { ScenarioArt } from "@/components/illustrations";
import { Badge } from "@/components/ui";
import { useRealtimeSession, type TurnWait } from "@/lib/client/use-realtime-session";
import { EXPRESSION_KIND_LABEL, type ExpressionKind } from "@/lib/categories";
import type { ExpressionPick } from "@/lib/expressions";

const TURN_WAIT_OPTIONS: { value: TurnWait; label: string; short: string }[] = [
  { value: "manual", label: "手動", short: "手動" },
  { value: "low", label: "自動・長め", short: "長め" },
  { value: "medium", label: "自動・標準", short: "標準" },
];

const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;

export function LiveSession({
  scenarioId,
  scenarioTitle,
  expressions,
  children,
}: {
  scenarioId: string;
  scenarioTitle: string;
  expressions: (ExpressionPick & { kind: ExpressionKind; text: string; meaning: string })[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { status, error, turns, maxMinutes, startedAt, turnWait, aiSpeaking, start, end, endTurn, setTurnWait, getLevel } =
    useRealtimeSession();
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

  const begin = async (force = false) => {
    setBudgetBlocked(false);
    const r = await start(scenarioId, expressions.map(({ id, role }) => ({ id, role })), force);
    if (r.budgetExceeded) setBudgetBlocked(true);
  };

  // --- レッスン前 ---
  if (status === "idle" || status === "error") {
    return (
      <>
        {children}
        <div className="sticky bottom-3 z-20 mt-10">
          <div className="rounded-xl border border-line bg-surface/95 p-3 backdrop-blur">
            {error && <p className="mb-2 border-l-2 border-bad bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
            {budgetBlocked ? (
              <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm">
                <p className="font-bold text-bad">今月の予算上限に達しています。</p>
                <button className="btn" onClick={() => begin(true)}>
                  それでも始める
                </button>
              </div>
            ) : (
              <button className="btn-primary w-full py-3.5 text-[15px]" onClick={() => begin()}>
                <Mic size={18} strokeWidth={2} />
                会話を始める
                <span className="font-mono text-xs font-normal opacity-80">max {maxMinutes} min</span>
              </button>
            )}
            <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-muted">
              <Headphones size={13} />
              イヤホン推奨・言い終えたら「話し終えた」（PC はスペースキー）
            </p>
          </div>
        </div>
      </>
    );
  }

  const live = status === "live";
  const yourTurn = live && !aiSpeaking;
  const progress = Math.min(1, elapsed / (maxMinutes * 60));

  // --- 会話中 ---
  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col">
      {/* 上部: シナリオ・経過時間・終了 */}
      <div className="sticky top-14 z-20 -mx-5 mb-4 border-b border-line bg-bg/95 px-5 pt-3 backdrop-blur sm:-mx-8 sm:px-8">
        <div className="flex items-center gap-3">
          <ScenarioArt id={scenarioId} size={32} />
          <div className="min-w-0 flex-1 truncate text-sm font-bold">{scenarioTitle}</div>
          <div className={`font-mono text-sm tabular-nums ${remaining < 60 ? "text-bad" : ""}`}>
            {mmss(elapsed)}
            <span className="text-muted"> / {maxMinutes}:00</span>
          </div>
          <button className="btn px-3 py-1.5" onClick={finish} disabled={!live} aria-label="会話を終了してフィードバックへ">
            {status === "ending" ? "送信中…" : (
              <>
                <X size={15} />
                <span className="hidden sm:inline">終了</span>
              </>
            )}
          </button>
        </div>
        {/* 今日の表現（横スクロール） */}
        <div className="-mx-1 mt-2.5 flex gap-1.5 overflow-x-auto px-1 pb-2.5 [scrollbar-width:none]">
          {expressions.map((e) => (
            <span key={e.id} title={`${EXPRESSION_KIND_LABEL[e.kind]}: ${e.meaning}`} className="shrink-0">
              <Badge tone={KIND_TONE[e.kind]}>{e.text}</Badge>
            </span>
          ))}
        </div>
        {/* 経過時間の細いバー（ヘッダー下端の罫線に重ねる） */}
        <div className="absolute inset-x-0 -bottom-px h-px">
          <div
            className={`h-full transition-[width] duration-1000 ${remaining < 60 ? "bg-bad" : "bg-accent"}`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      {/* 会話 */}
      <div className="flex flex-1 flex-col gap-4 pb-4" aria-live="polite">
        {status === "connecting" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-20 text-center">
            <p className="font-serif text-3xl italic">Connecting…</p>
            <p className="text-sm text-muted">マイクの使用を許可してください</p>
          </div>
        )}
        {turns.map((t) =>
          t.role === "assistant" ? (
            <div key={t.ref} className="max-w-[85%] animate-rise self-start">
              <div className="eyebrow mb-1">Partner</div>
              <div className="rounded-xl rounded-tl-sm border border-line bg-surface px-4 py-2.5 leading-relaxed">
                {t.text || <TypingDots />}
              </div>
            </div>
          ) : (
            <div key={t.ref} className="max-w-[85%] animate-rise self-end text-right">
              <div className="eyebrow mb-1">You</div>
              <div className="rounded-xl rounded-tr-sm bg-ink px-4 py-2.5 text-left leading-relaxed text-ink-fg">
                {t.text || <TypingDots light />}
              </div>
            </div>
          ),
        )}
        <div ref={bottom} />
      </div>

      {/* 下部: 番の表示・マイク・話し終えた */}
      <div className="sticky bottom-3 z-20">
        <div className="rounded-xl border border-line bg-surface/95 p-3 backdrop-blur">
          <div className="mb-2.5 flex items-center justify-between gap-2 px-0.5">
            <div className="flex min-w-0 items-center gap-2 text-sm font-bold">
              {aiSpeaking ? (
                <>
                  <span className="inline-flex size-2 animate-blink rounded-full bg-fg" />
                  <span className="truncate">相手が話しています</span>
                </>
              ) : live ? (
                <>
                  <MicMeter getLevel={getLevel} />
                  <span className="truncate text-accent">あなたの番です</span>
                </>
              ) : (
                <span className="text-muted">{status === "ending" ? "送信しています…" : "準備中…"}</span>
              )}
            </div>
            <div
              className="flex shrink-0 overflow-hidden rounded-lg border border-line text-[11px]"
              role="group"
              aria-label="AI に番を渡す方法（手動 / 自動・長め / 自動・標準）"
            >
              {TURN_WAIT_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setTurnWait(o.value)}
                  aria-pressed={turnWait === o.value}
                  className={`border-l border-line px-2.5 py-1 font-bold transition-colors first:border-l-0 ${
                    turnWait === o.value ? "bg-fg text-bg" : "text-muted hover:text-fg"
                  }`}
                >
                  <span className="sm:hidden">{o.short}</span>
                  <span className="hidden sm:inline">{o.label}</span>
                </button>
              ))}
            </div>
          </div>
          <button
            className={`btn-primary w-full py-3.5 text-[15px] ${yourTurn ? "" : "opacity-50"}`}
            onClick={endTurn}
            disabled={!live}
          >
            <Square size={13} strokeWidth={2.5} className="fill-current" />
            話し終えた
            <span className="hidden items-center gap-1 rounded border border-white/40 px-1.5 py-0.5 font-mono text-[10px] font-normal sm:inline-flex">
              <CornerDownLeft size={10} /> Space
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function TypingDots({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label="入力中">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`size-1 animate-blink rounded-full ${light ? "bg-ink-fg" : "bg-muted"}`}
          style={{ animationDelay: `${i * 0.18}s` }}
        />
      ))}
    </span>
  );
}

/** マイクの音量を5本のバーで表示する（描画はブラウザの描画周期ごとに直接更新） */
function MicMeter({ getLevel }: { getLevel: () => number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    let smooth = 0;
    let drawn = -1;
    const tick = () => {
      smooth = smooth * 0.7 + getLevel() * 0.3;
      const bars = ref.current?.children;
      // 見た目が変わらないほどの変化なら描き直さない
      if (bars && Math.abs(smooth - drawn) > 0.02) {
        drawn = smooth;
        for (let i = 0; i < bars.length; i++) {
          const h = Math.max(0.2, Math.min(1, smooth * (1.4 - Math.abs(i - 2) * 0.25) + ((i * 7) % 3) * 0.02));
          (bars[i] as HTMLElement).style.transform = `scaleY(${h})`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getLevel]);
  return (
    <span ref={ref} className="inline-flex h-4 items-center gap-[3px]" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="h-4 w-[3px] origin-center rounded-full bg-accent" />
      ))}
    </span>
  );
}
