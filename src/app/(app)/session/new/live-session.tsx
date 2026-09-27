"use client";

import { ChevronDown, ChevronLeft, Ellipsis, Mic, Square, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useRealtimeSession, type TurnWait } from "@/lib/client/use-realtime-session";
import type { ExpressionPick } from "@/lib/expressions";

const TURN_WAIT_OPTIONS: { value: TurnWait; label: string; note: string }[] = [
  { value: "manual", label: "手動", note: "「話し終えた」を押すまで待つ" },
  { value: "low", label: "自動・長め", note: "長めの沈黙で交代" },
  { value: "medium", label: "自動・標準", note: "ふつうの沈黙で交代" },
];

const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;

type Target = ExpressionPick & { text: string; meaning: string };

export function LiveSession({
  scenario,
  partner,
  expressions,
  children,
}: {
  scenario: { id: string; title: string; brief: string };
  /** 相手役の名前（なければ「相手」） */
  partner: string;
  expressions: Target[];
  /** 準備画面の本文（今日の表現） */
  children: React.ReactNode;
}) {
  const router = useRouter();
  const {
    status,
    error,
    turns,
    maxMinutes,
    startedAt,
    turnWait,
    aiSpeaking,
    start,
    end,
    endTurn,
    setTurnWait,
    getLevel,
  } = useRealtimeSession();
  const [budgetBlocked, setBudgetBlocked] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [sheet, setSheet] = useState(false);
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
    const r = await start(
      scenario.id,
      expressions.map(({ id, role }) => ({ id, role })),
      force,
    );
    if (r.budgetExceeded) setBudgetBlocked(true);
  };

  // --- レッスン前（準備） ---
  if (status === "idle" || status === "error") {
    const controls = (
      <div className="flex flex-col gap-3">
        {error && <p className="rounded-md bg-accent-soft px-3 py-2 text-sm text-accent">{error}</p>}
        {budgetBlocked ? (
          <>
            <p className="text-sm font-bold">今月の予算上限に達しています。</p>
            <button className="btn-primary w-full py-3" onClick={() => begin(true)}>
              それでも始める
            </button>
          </>
        ) : (
          <button className="btn-primary w-full py-3.5" onClick={() => begin()}>
            <Mic size={18} strokeWidth={2} />
            会話を始める
          </button>
        )}
        <p className="meta text-center">
          最大{maxMinutes}分 · イヤホン推奨<span className="max-lg:hidden"> · 言い終えたら「話し終えた」（Space）</span>
        </p>
      </div>
    );

    return (
      <main className="mx-auto w-full max-w-[1120px] px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-44 sm:px-8 lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-16 lg:px-10 lg:py-10">
        <div className="lg:sticky lg:top-10 lg:self-start">
          <Link href="/" className="btn-ghost mb-4 -ml-2.5 pl-1.5">
            <ChevronLeft size={18} strokeWidth={1.75} />
            ホーム
          </Link>
          <p className="meta">レッスンの準備</p>
          <h1 className="mt-0.5 text-[24px] leading-snug font-bold lg:text-[26px]">{scenario.title}</h1>
          <p className="mt-2 text-fg-2">{scenario.brief}</p>

          <div className="mt-8 hidden flex-col gap-6 lg:flex">
            <TurnWaitPicker value={turnWait} onChange={setTurnWait} />
            {controls}
          </div>
        </div>

        <section className="mt-8 lg:mt-0">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[17px] font-bold">今日の表現</h2>
            <span className="meta">{expressions.length}</span>
          </div>
          <p className="meta mt-0.5 mb-2">会話の中で使ってみましょう。AI が使いやすい流れを作ります。</p>
          <div className="divide-y divide-line border-y border-line">{children}</div>
        </section>

        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-float lg:hidden">
          {controls}
        </div>
      </main>
    );
  }

  const live = status === "live";
  const yourTurn = live && !aiSpeaking;
  const progress = Math.min(1, elapsed / (maxMinutes * 60));
  const lastMinute = remaining < 60;

  const targetList = (
    <ul className="divide-y divide-line">
      {expressions.map((e) => (
        <li key={e.id} className="py-3">
          <div className="text-[15px] leading-snug font-bold">{e.text}</div>
          <div className="meta">{e.meaning}</div>
        </li>
      ))}
    </ul>
  );

  // --- 会話中 ---
  return (
    <div className="flex h-dvh flex-col">
      {/* 上部: 終了・シナリオ・時間・設定。下端の線が経過時間 */}
      <header className="relative shrink-0 border-b border-line bg-bg pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center gap-3 px-3 sm:px-6">
          <button
            className="btn-ghost px-2"
            onClick={finish}
            disabled={!live}
            aria-label="会話を終了してフィードバックへ"
          >
            <X size={18} strokeWidth={1.75} />
            <span className="hidden sm:inline">{status === "ending" ? "送信中…" : "終了"}</span>
          </button>
          <div className="min-w-0 flex-1 truncate text-center text-sm font-bold">{scenario.title}</div>
          <div className={`text-sm tabular-nums ${lastMinute && live ? "font-bold text-accent" : "text-fg-2"}`}>
            {mmss(elapsed)}
            <span className="text-muted"> / {maxMinutes}:00</span>
          </div>
          <TurnWaitMenu value={turnWait} onChange={setTurnWait} />
        </div>
        <div className="absolute inset-x-0 -bottom-px h-0.5">
          <div
            className={`h-full transition-[width] duration-1000 ${lastMinute ? "bg-accent" : "bg-primary"}`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto">
          {/* スマホ: 今日の表現はシートで */}
          <button
            className="flex w-full items-center justify-between border-b border-line px-4 py-2.5 text-sm lg:hidden"
            onClick={() => setSheet(true)}
          >
            <span className="font-medium">今日の表現 {expressions.length}</span>
            <ChevronDown size={16} strokeWidth={1.75} className="text-muted" />
          </button>

          <div className="mx-auto flex max-w-[720px] flex-col gap-5 px-4 py-6 sm:px-6" aria-live="polite">
            {status === "connecting" && (
              <div className="py-20 text-center">
                <p className="font-bold">接続しています…</p>
                <p className="meta mt-1">マイクの使用を許可してください</p>
              </div>
            )}
            {turns.map((t) =>
              t.role === "assistant" ? (
                <div key={t.ref} className="max-w-[88%] self-start">
                  <div className="meta mb-0.5">{partner}</div>
                  <p className="text-[17px] leading-relaxed">{t.text || <TypingDots />}</p>
                </div>
              ) : (
                <div key={t.ref} className="max-w-[85%] self-end">
                  <div className="meta mb-0.5 text-right">あなた</div>
                  <div className="rounded-[14px] rounded-tr-[4px] bg-primary px-4 py-2.5 text-[16px] leading-relaxed text-primary-fg">
                    {t.text || <TypingDots light />}
                  </div>
                </div>
              ),
            )}
            <div ref={bottom} />
          </div>
        </div>

        {/* PC: 今日の表現を右に */}
        <aside className="hidden w-[300px] shrink-0 overflow-y-auto border-l border-line px-6 py-6 lg:block">
          <h2 className="text-[15px] font-bold">今日の表現</h2>
          {targetList}
        </aside>
      </div>

      {/* 下部ドック: 番によって中身が切り替わる */}
      <div className="shrink-0 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-float">
        <div className="flex min-h-[76px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:flex-nowrap sm:px-6">
          {yourTurn ? (
            <>
              <div className="flex items-center gap-3">
                <MicMeter getLevel={getLevel} />
                <span className="text-[17px] font-bold text-accent">あなたの番です</span>
              </div>
              <button className="btn-accent w-full py-3.5 text-base sm:ml-auto sm:w-auto sm:px-8" onClick={endTurn}>
                <Square size={13} strokeWidth={2.5} className="fill-current" />
                話し終えた
                <kbd className="ml-1 hidden rounded border border-current/40 px-1.5 font-sans text-[11px] font-medium opacity-80 sm:inline">
                  Space
                </kbd>
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3 text-[17px] text-fg-2">
              {aiSpeaking && <Breathing />}
              {aiSpeaking ? `${partner}が話しています` : status === "ending" ? "送信しています…" : "準備しています…"}
            </div>
          )}
        </div>
      </div>

      {sheet && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="今日の表現">
          <button className="absolute inset-0 bg-black/30" onClick={() => setSheet(false)} aria-label="閉じる" />
          <div className="absolute inset-x-0 bottom-0 max-h-[70dvh] overflow-y-auto rounded-t-[14px] bg-surface px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-float">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">今日の表現</h2>
              <button className="btn-ghost px-2" onClick={() => setSheet(false)} aria-label="閉じる">
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>
            {targetList}
          </div>
        </div>
      )}
    </div>
  );
}

/** 交代の方法（準備画面では常に表示） */
function TurnWaitPicker({ value, onChange }: { value: TurnWait; onChange: (v: TurnWait) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-bold">AI に番を渡す方法</legend>
      <div className="grid grid-cols-3 rounded-[10px] bg-sunken p-0.5">
        {TURN_WAIT_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={value === o.value}
            className={`rounded-lg py-1.5 text-[13px] transition-colors ${
              value === o.value
                ? "bg-surface font-bold text-primary shadow-card ring-1 ring-line"
                : "text-fg-2 hover:text-fg"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="meta mt-1.5">{TURN_WAIT_OPTIONS.find((o) => o.value === value)?.note}</p>
    </fieldset>
  );
}

/** 会話中は「…」の中に入れる */
function TurnWaitMenu({ value, onChange }: { value: TurnWait; onChange: (v: TurnWait) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        className="btn-ghost px-2"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="番を渡す方法"
      >
        <Ellipsis size={18} strokeWidth={1.75} />
      </button>
      {open && (
        <>
          <button className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} aria-label="閉じる" />
          <div className="absolute top-full right-0 z-50 mt-1 w-64 rounded-[12px] border border-line bg-surface p-1.5 shadow-float">
            <p className="meta px-2.5 pt-1 pb-1.5">AI に番を渡す方法</p>
            {TURN_WAIT_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`flex w-full flex-col items-start rounded-lg px-2.5 py-2 text-left hover:bg-sunken ${
                  value === o.value ? "bg-sunken" : ""
                }`}
              >
                <span className={`text-sm ${value === o.value ? "font-bold" : ""}`}>{o.label}</span>
                <span className="meta">{o.note}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Breathing() {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-blink rounded-full bg-fg-2"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </span>
  );
}

function TypingDots({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label="入力中">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`size-1 animate-blink rounded-full ${light ? "bg-primary-fg" : "bg-muted"}`}
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
