"use client";

import { ChevronDown, ChevronLeft, Mic, Square, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useRealtimeSession } from "@/lib/client/use-realtime-session";
import type { ExpressionPick } from "@/lib/expressions";
import {
  AssistantTurn,
  Breathing,
  LENGTHS,
  MicMeter,
  Segmented,
  SessionMenu,
  Switch,
  TargetHints,
  TURN_WAIT_OPTIONS,
  TypingDots,
  useListenMode,
  useSessionLength,
} from "./live-parts";

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
    aiThinking: thinking,
    reconnecting,
    connectionLost,
    start,
    end,
    endTurn,
    setTurnWait,
    getLevel,
  } = useRealtimeSession();
  const [minutes, setMinutes] = useSessionLength();
  const [listen, setListen] = useListenMode();
  // 予算の上限: soft は「それでも始める」可、hard（上限の120%）は始められない
  const [budgetBlocked, setBudgetBlocked] = useState<"soft" | "hard" | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [sheet, setSheet] = useState(false);
  // 「終了」は誤タップしやすい位置にあるので、確認を1回はさむ
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [shownTargets, setShownTargets] = useState<Set<number>>(new Set());
  const bottom = useRef<HTMLDivElement>(null);
  const ending = useRef(false);

  const live = status === "live";
  const elapsed = startedAt ? Math.floor((now - startedAt) / 1000) : 0;
  const remaining = maxMinutes * 60 - elapsed;

  const finish = async () => {
    if (ending.current) return;
    ending.current = true;
    setConfirmEnd(false);
    const id = await end();
    router.push(`/session/${id}`);
  };

  // Esc で表現シート・終了の確認を閉じる
  useEffect(() => {
    if (!sheet && !confirmEnd) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSheet(false);
      setConfirmEnd(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet, confirmEnd]);

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [live]);

  useEffect(() => {
    if (live && remaining <= 0) void finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, live]);

  // 波かっこ必須: 新しいブラウザでは scrollIntoView が Promise を返し、それを後片付け関数として返すと React が落ちる
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length]);

  // スペースキーでも「話し終えた」（シート・確認を開いている間は効かせない）
  useEffect(() => {
    if (!live || sheet || confirmEnd) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || (e.target as HTMLElement).closest("input, textarea, button")) return;
      e.preventDefault();
      endTurn();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [live, endTurn, sheet, confirmEnd]);

  // 接続が切れて戻らなければ、ここまでの会話でフィードバックへ（1回だけ）
  useEffect(() => {
    if (connectionLost) void finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionLost]);

  const begin = async (force = false) => {
    setBudgetBlocked(null);
    const r = await start(
      scenario.id,
      expressions.map(({ id, role }) => ({ id, role })),
      force,
      Number(minutes),
    );
    if (r.budgetExceeded) setBudgetBlocked("hardCap" in r && r.hardCap ? "hard" : "soft");
  };

  // --- レッスン前（準備） ---
  if (status === "idle" || status === "error") {
    const controls = (
      <div className="flex flex-col gap-3">
        {error && <p className="rounded-md bg-accent-soft px-3 py-2 text-sm text-accent">{error}</p>}
        {budgetBlocked === "hard" ? (
          <p className="text-sm">
            <b>今月の予算の上限（120%）に達したため、会話を始められません。</b>
            <span className="text-fg-2"> 来月になるか、設定の予算を見直すと再開できます。</span>
          </p>
        ) : budgetBlocked ? (
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
          イヤホン推奨<span className="max-lg:hidden"> · 言い終えたら「話し終えた」（Space）</span>
        </p>
      </div>
    );
    const settings = (
      <div className="flex flex-col gap-6">
        <Segmented
          legend="会話の長さ"
          options={LENGTHS.map((m) => ({ value: m, label: `${m}分` }))}
          value={minutes}
          onChange={setMinutes}
        />
        <Segmented legend="AI に番を渡す方法" options={TURN_WAIT_OPTIONS} value={turnWait} onChange={setTurnWait} />
        <Switch
          label="聞き取りモード"
          note="相手の英語を文字で出さず、耳で聞きます"
          checked={listen}
          onChange={setListen}
        />
      </div>
    );

    return (
      <main className="mx-auto w-full max-w-[1120px] px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-44 sm:px-8 lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-16 lg:px-10 lg:py-10">
        <div className="lg:sticky lg:top-10 lg:self-start">
          <Link href="/" className="btn-ghost mb-4 -ml-2.5 pl-1.5">
            <ChevronLeft size={18} strokeWidth={1.75} />
            ホーム
          </Link>
          <h1 className="text-[24px] leading-snug font-bold lg:text-[26px]">{scenario.title}</h1>
          <p className="mt-2 text-fg-2">{scenario.brief}</p>

          <div className="mt-8 hidden flex-col gap-8 lg:flex">
            {settings}
            {controls}
          </div>
        </div>

        <section className="mt-8 lg:mt-0">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[17px] font-bold">今日の表現</h2>
            <span className="meta">{expressions.length}</span>
          </div>
          <p className="meta mt-0.5 mb-2">
            会話の中で使ってみましょう。会話中は意味だけが表示されるので、ここで英語を確認しておきます。
          </p>
          <div className="divide-y divide-line border-y border-line">{children}</div>
          {/* スマホでも始める前に選べるように（PC は左の欄） */}
          <div className="mt-8 lg:hidden">
            <h2 className="mb-4 text-[17px] font-bold">会話の設定</h2>
            {settings}
          </div>
        </section>

        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-float lg:hidden">
          {controls}
        </div>
      </main>
    );
  }

  const yourTurn = live && !aiSpeaking && !thinking && !reconnecting && !connectionLost;
  const progress = Math.min(1, elapsed / (maxMinutes * 60));
  const lastMinute = remaining < 60;
  const targets = (
    <TargetHints items={expressions} shown={shownTargets} onShow={(id) => setShownTargets((s) => new Set(s).add(id))} />
  );

  // --- 会話中 ---
  return (
    <div className="flex h-dvh flex-col overscroll-none">
      {/* 上部: 終了・シナリオ・時間・設定。下端の線が経過時間 */}
      <header className="relative shrink-0 border-b border-line bg-bg pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center gap-3 px-3 sm:px-6">
          <button className="btn-ghost px-2" onClick={() => setConfirmEnd(true)} disabled={!live}>
            <X size={18} strokeWidth={1.75} />
            {status === "ending" ? "送信中…" : "終了"}
          </button>
          <div className="min-w-0 flex-1 truncate text-center text-sm font-bold">{scenario.title}</div>
          <div
            className={`text-sm tabular-nums ${lastMinute && live ? "font-bold text-accent" : "text-fg-2"}`}
            aria-label={`経過 ${mmss(elapsed)}（最大${maxMinutes}分）`}
          >
            {mmss(elapsed)}
            <span className="text-muted max-sm:hidden"> / {maxMinutes}:00</span>
          </div>
          <SessionMenu turnWait={turnWait} onTurnWait={setTurnWait} listen={listen} onListen={setListen} />
        </div>
        <div className="absolute inset-x-0 -bottom-px h-0.5">
          <div
            className={`h-full transition-[width] duration-1000 ${lastMinute ? "bg-accent" : "bg-primary"}`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {/* スマホ: 今日の表現はシートで */}
            <button
              className="flex w-full items-center justify-between border-b border-line px-4 py-2.5 text-sm lg:hidden"
              onClick={() => setSheet(true)}
              aria-haspopup="dialog"
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
                  <AssistantTurn key={t.ref} partner={partner} text={t.text} listen={listen} />
                ) : (
                  <div key={t.ref} className="max-w-[85%] self-end">
                    <div className="meta mb-0.5 text-right">あなた</div>
                    {t.unheard ? (
                      <div className="rounded-[14px] rounded-tr-[4px] border border-dashed border-line-strong px-4 py-2.5 text-sm text-muted">
                        （聞き取れませんでした）
                      </div>
                    ) : (
                      <div className="rounded-[14px] rounded-tr-[4px] bg-primary px-4 py-2.5 text-[16px] leading-relaxed text-primary-fg">
                        {t.text || <TypingDots light />}
                      </div>
                    )}
                  </div>
                ),
              )}
              <div ref={bottom} />
            </div>
          </div>

          {/* 下部ドック: 番によって中身が切り替わる。会話の列の幅に揃え、あなたの番は上端の線も朱色に */}
          <div
            className={`shrink-0 border-t-2 bg-surface pb-[env(safe-area-inset-bottom)] shadow-float transition-colors ${
              yourTurn ? "border-accent" : "border-line"
            }`}
          >
            {connectionLost ? (
              <p className="mx-auto max-w-[720px] px-4 pt-2.5 text-[13px] font-medium text-accent sm:px-6" role="alert">
                接続が切れました。ここまでの会話でフィードバックを作成します
              </p>
            ) : (
              live &&
              error && (
                <p className="mx-auto max-w-[720px] px-4 pt-2.5 text-[13px] text-accent sm:px-6" role="alert">
                  {error}
                </p>
              )
            )}
            {live && lastMinute && (
              <p
                className="mx-auto max-w-[720px] px-4 pt-2.5 text-[13px] font-medium text-accent sm:px-6"
                role="status"
              >
                まもなく自動で終了します。区切りのよいところでまとめましょう。
              </p>
            )}
            <div className="mx-auto flex min-h-[76px] max-w-[720px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:flex-nowrap sm:px-6">
              {reconnecting ? (
                <div className="flex items-center gap-3 text-[17px] text-fg-2">
                  <Breathing />
                  再接続中…
                </div>
              ) : yourTurn ? (
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
                  {(aiSpeaking || thinking) && <Breathing />}
                  {aiSpeaking
                    ? `${partner}が話しています`
                    : thinking
                      ? `${partner}が考えています…`
                      : status === "ending"
                        ? "送信しています…"
                        : "準備しています…"}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* PC: 今日の表現を右に */}
        <aside className="hidden w-[300px] shrink-0 overflow-y-auto border-l border-line px-6 py-6 lg:block">
          <h2 className="text-[15px] font-bold">今日の表現</h2>
          {targets}
        </aside>
      </div>

      {confirmEnd && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="end-title"
        >
          <button
            className="absolute inset-0 cursor-default bg-black/30"
            onClick={() => setConfirmEnd(false)}
            aria-label="会話を続ける"
          />
          <div className="relative w-full rounded-t-[14px] bg-surface px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-float sm:max-w-sm sm:rounded-[14px] sm:pb-5">
            <h2 id="end-title" className="text-[17px] font-bold">
              会話を終了しますか？
            </h2>
            <p className="mt-1 text-sm text-fg-2">
              {elapsed < 180
                ? `まだ${mmss(elapsed)}です。短い会話だと、フィードバックの材料が少なくなります。`
                : "ここまでの会話を分析して、フィードバックを作ります。"}
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button className="btn py-2.5" onClick={() => setConfirmEnd(false)} autoFocus>
                会話を続ける
              </button>
              <button className="btn-primary" onClick={finish}>
                終了してフィードバックへ
              </button>
            </div>
          </div>
        </div>
      )}

      {sheet && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="今日の表現">
          <button className="absolute inset-0 bg-black/30" onClick={() => setSheet(false)} aria-label="閉じる" />
          <div className="absolute inset-x-0 bottom-0 max-h-[70dvh] overflow-y-auto overscroll-contain rounded-t-[14px] bg-surface px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-float">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">今日の表現</h2>
              <button className="btn-ghost px-2" onClick={() => setSheet(false)} aria-label="閉じる" autoFocus>
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>
            {targets}
          </div>
        </div>
      )}
    </div>
  );
}
