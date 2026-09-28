"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Turn } from "@/db/schema";
import { turnDetectionFor, TURN_WAITS, type RealtimeUsage, type TranscriptionUsage, type TurnWait } from "@/lib/config";
import { withPreviousLine } from "@/lib/conversation-prompt";
import type { ExpressionPick } from "@/lib/expressions";
import type { TranscriptionConfig } from "@/lib/session";
import { saveUtterance } from "./audio-store";
import { SAMPLE_RATE, toWav, trimSilence, UtteranceRecorder, voicedMs, voiceOnsetMs } from "./recorder";

export type { TurnWait };

/** ref は Realtime API の item_id / response_id。unheard: 文字起こしに失敗した自分の発話（終了時にサーバーが Azure の聞き取りで補う） */
export type LiveTurn = Turn & { ref: string; unheard?: boolean };

type Status = "idle" | "connecting" | "live" | "ending" | "error";

/** VAD の検出遅延ぶん、発話開始より前から切り出す */
const PRE_ROLL = Math.round(SAMPLE_RATE * 1.2);
const MIN_SPEECH_MS = 400;
const MAX_CLIP = SAMPLE_RATE * 60;
/** 終了時、最後の発話の文字起こしを待つ上限 */
const FLUSH_WAIT_MS = 3000;
/** 終了時、発音評価への送信を待つ上限 */
const UPLOAD_WAIT_MS = 30_000;
const CONNECT_TIMEOUT_MS = 20_000;
/** 回線が途切れて（disconnected）から、戻らなければ切れたとみなすまで */
const LOST_AFTER_MS = 10_000;
/** 会話の長さを過ぎても終了されないとき（タブが裏にあってタイマーが止まった等）に、こちらで切るまでの猶予 */
const HARD_STOP_GRACE_MS = 60_000;

const TURN_WAIT_KEY = "esp-turn-wait";
const PENDING_END_KEY = "esp-pending-end";
const AUDIO: MediaStreamConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
};

/** 前回選んだ交代の方法（既定は「手動」: 何秒考えても割り込まれない） */
function loadTurnWait(): TurnWait {
  try {
    const v = localStorage.getItem(TURN_WAIT_KEY) ?? "";
    return (TURN_WAITS as readonly string[]).includes(v) ? (v as TurnWait) : "manual";
  } catch {
    return "manual";
  }
}

type NumTree = { [k: string]: number | NumTree | undefined };

/** response.done の usage を数値の葉ごとに足し合わせる */
function addUsage(a: NumTree, b: NumTree): NumTree {
  const out: NumTree = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k];
    if (typeof v === "number") out[k] = (typeof cur === "number" ? cur : 0) + v;
    else if (v) out[k] = addUsage(typeof cur === "object" ? cur : {}, v);
  }
  return out;
}

/** 終了・途中保存でサーバーに送る内容 */
type EndPayload = {
  turns: Turn[];
  durationSec: number;
  realtimeUsage: RealtimeUsage;
  transcriptionUsage: TranscriptionUsage;
};

const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const json = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** 通信エラー・5xx なら間隔を倍にしながら再送する（4xx は何度送っても同じなのでそのまま返す） */
async function postWithRetry(url: string, init: RequestInit, attempts = 4) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { method: "POST", ...init });
      if (res.status < 500 || i >= attempts) return res;
    } catch (e) {
      if (i >= attempts) throw e;
    }
    await sleep(1000 * 2 ** (i - 1));
  }
}

/** ページを離れる直前でも届く送信（応答は待てない） */
function beacon(url: string, body: unknown) {
  const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
  if (!navigator.sendBeacon?.(url, blob))
    void fetch(url, { method: "POST", body: blob, keepalive: true }).catch(() => {});
}

/** 届いたと確認できていない終了の連絡（sessionId → 内容）。端末に残し、次にこの画面を開いたときに送り直す */
function pendingEnds(): Record<string, EndPayload> {
  try {
    return JSON.parse(localStorage.getItem(PENDING_END_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function setPendingEnd(id: number, body: EndPayload | null) {
  try {
    const all = pendingEnds();
    if (body) all[id] = body;
    else delete all[id];
    localStorage.setItem(PENDING_END_KEY, JSON.stringify(all));
  } catch {}
}

/** 終了を送る。受け付けられたら（終了済み・存在しないも含む）端末の控えを消し、通信できなければ残す */
async function sendEnd(id: number, body: EndPayload) {
  setPendingEnd(id, body);
  const res = await postWithRetry(`/api/session/${id}/end`, json(body)).catch(() => null);
  if (res && res.status < 500 && res.status !== 401) setPendingEnd(id, null);
  return Boolean(res?.ok);
}

function micError(e: unknown) {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "マイクの使用が許可されていません。ブラウザ（iPhone は設定アプリ）でマイクを許可してから、もう一度お試しください。";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "マイクが見つかりません。接続を確認してください。";
  if (name === "NotReadableError") return "マイクを使用できません。ほかのアプリが使っていないか確認してください。";
  return `マイクを使用できません（${e instanceof Error ? e.message : String(e)}）`;
}

export function useRealtimeSession() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<LiveTurn[]>([]);
  const [maxMinutes, setMaxMinutes] = useState(15);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  // 交代の方法は画面表示用の state と、イベント処理から読む ref の両方に持つ（更新は setTurnWait だけ）。
  // 保存値はマウント後に読む（描画中に読むとサーバー描画と食い違う）
  const [turnWait, setTurnWaitState] = useState<TurnWait>("manual");
  /** AI が音声を再生中か（画面の「AI が話しています」表示用） */
  const [aiSpeaking, setAiSpeakingState] = useState(false);
  /** 自分の発話が確定してから、AI の声が出始めるまで（画面の「考えています」表示用） */
  const [aiThinking, setAiThinking] = useState(false);
  /** 回線が一時的に途切れ、復旧を待っている */
  const [reconnecting, setReconnecting] = useState(false);
  /** 接続が切れた（または時間を大きく過ぎたので切った）。会話は続けられないので、終了してフィードバックへ進む */
  const [connectionLost, setConnectionLost] = useState(false);

  const r = useRef({
    /** status と違い、イベント処理から同期的に読む進行状態 */
    phase: "idle" as "idle" | "starting" | "live" | "ending",
    pc: null as RTCPeerConnection | null,
    dc: null as RTCDataChannel | null,
    sender: null as RTCRtpSender | null,
    stream: null as MediaStream | null,
    recorder: null as UtteranceRecorder | null,
    audio: null as HTMLAudioElement | null,
    turns: [] as LiveTurn[],
    usage: {} as NumTree,
    transcriptionUsage: { audioTokens: 0, textTokens: 0, outputTokens: 0, seconds: 0 } as TranscriptionUsage,
    transcription: null as TranscriptionConfig | null,
    seq: 0,
    turnWait: "manual" as TurnWait,
    /**
     * 自分の発話を確定してから AI 側で確定するまでの状態。
     * auto: 自動判定を一時停止中（応答が始まったら戻す） / manual: 手動で確定した発話（committed で会話に加える）
     * / flush: 終了時の送り切り（committed で終わり）
     */
    ending: null as null | { mode: "auto" | "flush" } | { mode: "manual"; seq: number; latencyMs?: number },
    /** 手動モード: 自分の番が始まった位置（録音のサンプル位置）。AI 側の音声バッファもここで区切る */
    manualStart: 0,
    speech: new Map<string, { seq: number; startIdx: number; startMs: number; done?: boolean }>(),
    /** 確定済みで文字起こしを待っている発話の item_id */
    awaiting: new Set<string>(),
    /** AI の応答を生成中か・音声を再生中か */
    responding: false,
    aiSpeaking: false,
    /** AI が話し終えた録音位置（次の発話の話し始めまでの時間を測る起点） */
    aiStopPos: null as number | null,
    uploads: [] as Promise<unknown>[],
    sessionId: 0,
    startedAt: 0,
    maxMinutes: 15,
    lostTimer: undefined as ReturnType<typeof setTimeout> | undefined,
    hardStop: undefined as ReturnType<typeof setTimeout> | undefined,
    endPromise: null as Promise<number> | null,
  });

  useEffect(() => {
    r.current.turnWait = turnWait;
  }, [turnWait]);

  const setAiSpeaking = useCallback((v: boolean) => {
    r.current.aiSpeaking = v;
    setAiSpeakingState(v);
  }, []);

  const updateTurns = useCallback((fn: (turns: LiveTurn[]) => LiveTurn[]) => {
    r.current.turns = fn(r.current.turns);
    setTurns(r.current.turns);
  }, []);
  const patchTurn = useCallback(
    (ref: string, fn: (t: LiveTurn) => LiveTurn) => updateTurns((ts) => ts.map((t) => (t.ref === ref ? fn(t) : t))),
    [updateTurns],
  );

  /** Realtime API へのクライアントイベント送信 */
  const send = useCallback((ev: Record<string, unknown>) => {
    const dc = r.current.dc;
    if (dc?.readyState === "open") dc.send(JSON.stringify(ev));
  }, []);

  /** 話し終わりの自動判定を切り替える（manual で止める） */
  const sendTurnDetection = useCallback(
    (wait: TurnWait) =>
      send({
        type: "session.update",
        session: { type: "realtime", audio: { input: { turn_detection: turnDetectionFor(wait) } } },
      }),
    [send],
  );

  /** 確定待ちを終える。自動モードで一時停止していた自動判定を元に戻す */
  const finishEnding = useCallback(() => {
    const s = r.current;
    if (s.ending?.mode === "auto") sendTurnDetection(s.turnWait);
    s.ending = null;
  }, [sendTurnDetection]);

  /** 手動モード: ここから自分の番。録音と AI 側の音声バッファを同じ位置で区切り、文字起こしと発音評価の範囲をそろえる */
  const startManualTurn = useCallback(() => {
    const s = r.current;
    if (s.turnWait !== "manual" || !s.recorder) return;
    s.manualStart = s.recorder.position;
    send({ type: "input_audio_buffer.clear" });
  }, [send]);

  /** 終了・途中保存で送る内容。文字起こしが届かなかった自分の発話も番号付きで送る（サーバーが Azure の聞き取りで補う） */
  const payload = useCallback((at = Date.now()): EndPayload => {
    const s = r.current;
    return {
      turns: s.turns
        .filter((t) => t.text.trim() || (t.role === "user" && t.seq !== undefined))
        .map(({ role, text, seq, latencyMs }) => ({ role, text: text.trim(), seq, latencyMs })),
      durationSec: s.startedAt ? (at - s.startedAt) / 1000 : 0,
      realtimeUsage: s.usage as RealtimeUsage,
      transcriptionUsage: s.transcriptionUsage,
    };
  }, []);

  /** 途中保存（応答ごと・タブが隠れたとき）。タブを閉じた・落ちた場合も、ここまでの会話と費用が残る */
  const checkpoint = useCallback(
    (viaBeacon = false) => {
      const s = r.current;
      if (s.phase !== "live" || !s.sessionId) return;
      const url = `/api/session/${s.sessionId}/checkpoint`;
      if (viaBeacon) beacon(url, payload());
      else void fetch(url, { method: "POST", ...json(payload()) }).catch(() => {});
    },
    [payload],
  );

  /** AI が話し終えてから、この発話の声が出始めるまでの時間（AI の番の直後の発話だけ。測れなければ undefined） */
  const takeLatency = useCallback(() => {
    const s = r.current;
    const from = s.aiStopPos;
    s.aiStopPos = null;
    if (from === null || !s.recorder || s.recorder.position - from > MAX_CLIP) return undefined;
    return voiceOnsetMs(s.recorder.slice(from, s.recorder.position)) ?? undefined;
  }, []);

  /** 1発話分の録音を前後の無音を削って端末に保存し、発音評価に送る（失敗したら再送） */
  const uploadClip = useCallback((seq: number, pcm: Int16Array, durationMs: number) => {
    const s = r.current;
    const wav = toWav(trimSilence(pcm));
    void saveUtterance(s.sessionId, seq, wav);
    s.uploads.push(
      postWithRetry(
        `/api/session/${s.sessionId}/utterance?seq=${seq}&durationMs=${Math.round(durationMs)}`,
        { body: wav, headers: { "Content-Type": "audio/wav" } },
        3,
      ).catch((e) => console.error("upload failed", e)),
    );
  }, []);

  /** 自動判定で検出した発話を、終わった時点で切り出す */
  const finalizeSpeech = useCallback(
    (itemId: string, durationMs: number) => {
      const s = r.current;
      const sp = s.speech.get(itemId);
      if (!sp || sp.done || !s.recorder) return;
      sp.done = true;
      if (durationMs < MIN_SPEECH_MS) return;
      const end = s.recorder.position;
      const latencyMs = takeLatency();
      if (latencyMs !== undefined) patchTurn(itemId, (t) => ({ ...t, latencyMs }));
      uploadClip(sp.seq, s.recorder.slice(Math.max(sp.startIdx, end - MAX_CLIP), end), durationMs);
    },
    [uploadClip, takeLatency, patchTurn],
  );

  /** 相手の直前の発言を文字起こしの文脈に入れる（何への返答かが分かると聞き違いが減る） */
  const updateTranscriptionContext = useCallback(
    (line: string) => {
      const tc = r.current.transcription;
      if (!tc) return;
      send({
        type: "session.update",
        session: {
          type: "realtime",
          audio: { input: { transcription: { ...tc, prompt: withPreviousLine(tc.prompt, line) } } },
        },
      });
    },
    [send],
  );

  /** 通話だけを閉じる（マイクと録音は残す） */
  const closeCall = useCallback(() => {
    const s = r.current;
    clearTimeout(s.lostTimer);
    clearTimeout(s.hardStop);
    if (s.dc) s.dc.onclose = null;
    if (s.pc) {
      s.pc.onconnectionstatechange = null;
      s.pc.close();
    }
    if (s.audio) s.audio.srcObject = null;
    s.pc = null;
    s.dc = null;
    s.sender = null;
  }, []);

  const cleanup = useCallback(async () => {
    const s = r.current;
    closeCall();
    s.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    s.stream = null;
    const recorder = s.recorder;
    s.recorder = null;
    await recorder?.close();
  }, [closeCall]);

  /** 接続が切れた（切った）: 通話を閉じ、終了へ進めるようにする。録音と会話の記録は終了時に送る */
  const lose = useCallback(() => {
    const s = r.current;
    if (s.phase !== "live") return;
    checkpoint();
    closeCall();
    s.responding = false;
    s.ending = null;
    setAiSpeaking(false);
    setAiThinking(false);
    setReconnecting(false);
    setConnectionLost(true);
  }, [checkpoint, closeCall, setAiSpeaking]);

  // Realtime API のサーバーイベント（型は公式ドキュメント参照。ここでは必要なフィールドだけ読む）
  const onEvent = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ev: Record<string, any>) => {
      const s = r.current;
      switch (ev.type) {
        case "input_audio_buffer.speech_started": {
          if (!s.recorder) break;
          const seq = ++s.seq;
          s.speech.set(ev.item_id, {
            seq,
            startIdx: s.recorder.position - PRE_ROLL,
            startMs: ev.audio_start_ms,
          });
          updateTurns((ts) => [...ts, { role: "user", text: "", seq, ref: ev.item_id }]);
          break;
        }
        case "input_audio_buffer.speech_stopped": {
          const sp = s.speech.get(ev.item_id);
          if (sp) finalizeSpeech(ev.item_id, ev.audio_end_ms - sp.startMs);
          break;
        }
        case "input_audio_buffer.committed": {
          s.awaiting.add(ev.item_id);
          // 手動で確定した発話は、AI 側の item_id が決まったここで会話に加える
          const ending = s.ending;
          // 終了時の送り切り以外は、このあと AI が応答する
          if (ending?.mode !== "flush") setAiThinking(true);
          if (ending?.mode === "manual") {
            updateTurns((ts) => [
              ...ts,
              { role: "user", text: "", seq: ending.seq, latencyMs: ending.latencyMs, ref: ev.item_id },
            ]);
          }
          if (ending?.mode === "manual" || ending?.mode === "flush") s.ending = null;
          break;
        }
        case "conversation.item.input_audio_transcription.completed": {
          s.awaiting.delete(ev.item_id);
          const u = ev.usage;
          const tu = s.transcriptionUsage;
          if (u?.type === "tokens") {
            tu.audioTokens += u.input_token_details?.audio_tokens ?? u.input_tokens ?? 0;
            tu.textTokens += u.input_token_details?.text_tokens ?? 0;
            tu.outputTokens += u.output_tokens ?? 0;
          } else if (u?.type === "duration") tu.seconds += u.seconds ?? 0;
          patchTurn(ev.item_id, (t) => ({ ...t, text: ev.transcript ?? "" }));
          break;
        }
        case "conversation.item.input_audio_transcription.failed":
          s.awaiting.delete(ev.item_id);
          console.error("transcription failed", ev.error);
          patchTurn(ev.item_id, (t) => ({ ...t, unheard: true }));
          break;
        case "output_audio_buffer.started":
          setAiThinking(false);
          setAiSpeaking(true);
          s.aiStopPos = null;
          break;
        case "output_audio_buffer.stopped":
          setAiSpeaking(false);
          // 再生が終わった位置から自分の番（応答の生成完了時点で一度区切っているが、再生中の無音を含めないよう区切り直す）
          if (s.recorder) s.aiStopPos = s.recorder.position;
          startManualTurn();
          break;
        case "output_audio_buffer.cleared":
          setAiThinking(false);
          setAiSpeaking(false);
          break;
        case "response.created":
          s.responding = true;
          updateTurns((ts) => [...ts, { role: "assistant", text: "", ref: ev.response.id }]);
          finishEnding();
          break;
        case "response.output_audio_transcript.delta":
          patchTurn(ev.response_id, (t) => ({ ...t, text: t.text + ev.delta }));
          break;
        case "response.output_audio_transcript.done":
          patchTurn(ev.response_id, (t) => ({ ...t, text: ev.transcript }));
          updateTranscriptionContext(ev.transcript ?? "");
          break;
        case "response.done": {
          s.responding = false;
          const res = ev.response ?? {};
          if (res.usage) s.usage = addUsage(s.usage, res.usage);
          // 取り消し・失敗で何も話さなかった応答は表示から消す
          updateTurns((ts) => ts.filter((t) => t.ref !== res.id || t.text.trim()));
          // 音声のない応答（取り消し・失敗）では started が来ないので、ここで「考えています」を終える
          if (!s.aiSpeaking && res.status !== "completed") setAiThinking(false);
          if (res.status === "failed") {
            console.error("response failed", res.status_details);
            setError(`AI の応答に失敗しました: ${res.status_details?.error?.message ?? "不明なエラー"}`);
          }
          startManualTurn();
          checkpoint();
          break;
        }
        case "error":
          console.error("realtime error", ev.error);
          // 確定に失敗しても「話し終えた」が効かなくならないよう状態を戻す
          finishEnding();
          if (!s.responding) setAiThinking(false);
          break;
      }
    },
    [
      updateTurns,
      patchTurn,
      finalizeSpeech,
      finishEnding,
      startManualTurn,
      setAiSpeaking,
      updateTranscriptionContext,
      checkpoint,
    ],
  );

  /** 交代の方法を切り替える（会話中でも可）。選択は次回のために保存する */
  const setTurnWait = useCallback(
    (wait: TurnWait) => {
      r.current.turnWait = wait;
      setTurnWaitState(wait);
      sendTurnDetection(wait);
      // 手動に切り替えたら、ここから自分の番を数え直す（前の発話を二重に切り出さない）
      startManualTurn();
      try {
        localStorage.setItem(TURN_WAIT_KEY, wait);
      } catch {}
    },
    [sendTurnDetection, startManualTurn],
  );

  /**
   * ここまでの自分の発話を確定する。respond なら AI に応答させる（「話し終えた」）、しないなら終了時の送り切り。
   * 自動モードでは自動判定をいったん止めてから確定する（止めないと残りの音声が別の発話とみなされ、AI が二重に応答する）。
   * 確定したら true
   */
  const commitTurn = useCallback(
    (respond: boolean) => {
      const s = r.current;
      // AI の応答中・再生中は自分の番ではない（Space キーは画面の表示に関係なく届く）
      if (s.dc?.readyState !== "open" || !s.recorder || s.ending || s.responding || s.aiSpeaking) return false;
      const end = s.recorder.position;

      if (s.turnWait === "manual") {
        // 手動: AI が話し終えてからここまでを1発話とする（自動判定は使わない）
        const pcm = s.recorder.slice(Math.max(s.manualStart, end - MAX_CLIP), end);
        const voiced = voicedMs(pcm);
        if (voiced < MIN_SPEECH_MS) return false;
        const seq = ++s.seq;
        s.ending = { mode: "manual", seq, latencyMs: takeLatency() };
        s.manualStart = end;
        uploadClip(seq, pcm, voiced);
      } else {
        const pending = [...s.speech.entries()].filter(([, sp]) => !sp.done).at(-1);
        if (!pending) return false;
        const [itemId, sp] = pending;
        s.ending = { mode: respond ? "auto" : "flush" };
        sendTurnDetection("manual");
        finalizeSpeech(itemId, ((end - sp.startIdx - PRE_ROLL) * 1000) / SAMPLE_RATE);
      }
      send({ type: "input_audio_buffer.commit" });
      if (respond) send({ type: "response.create" });
      return true;
    },
    [send, sendTurnDetection, finalizeSpeech, uploadClip, takeLatency],
  );

  /** 「話し終えた」: ここまでの発話を確定して AI に応答させる */
  const endTurn = useCallback(() => {
    const s = r.current;
    // タップ・キー操作の中なので、止まっていた録音・再生（iOS のバックグラウンド復帰など）をここで再開できる
    void s.recorder?.resume();
    if (s.audio?.srcObject) void s.audio.play().catch(() => {});
    commitTurn(true);
  }, [commitTurn]);

  /** マイクが使えなくなった（抜いた・権限を取り消した）ら取り直し、通話と録音の入力を差し替える */
  const replaceMic = useCallback(async function replace() {
    const s = r.current;
    if (s.phase !== "live") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia(AUDIO);
      const track = stream.getAudioTracks()[0];
      if (s.phase !== "live" || !s.recorder || !s.sender) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      await s.sender.replaceTrack(track);
      s.recorder.attach(stream);
      s.stream?.getTracks().forEach((t) => t.stop());
      s.stream = stream;
      track.onended = () => void replace();
    } catch (e) {
      setError(micError(e));
    }
  }, []);

  const start = useCallback(
    async (scenarioId: string, picks: ExpressionPick[], force = false, minutes?: number) => {
      const s = r.current;
      if (s.phase !== "idle") return { budgetExceeded: false as const };
      s.phase = "starting";
      Object.assign(s, {
        turns: [],
        usage: {},
        transcriptionUsage: { audioTokens: 0, textTokens: 0, outputTokens: 0, seconds: 0 },
        seq: 0,
        ending: null,
        manualStart: 0,
        speech: new Map(),
        awaiting: new Set(),
        responding: false,
        aiStopPos: null,
        uploads: [],
        sessionId: 0,
        startedAt: 0,
        endPromise: null,
      });
      setTurns([]);
      setError(null);
      setConnectionLost(false);
      setReconnecting(false);
      setAiSpeaking(false);
      setAiThinking(false);
      setStatus("connecting");
      // AudioContext はタップの直後に同期で作る（await の後だと iOS Safari などで停止状態のまま始まる）
      const ctx = new AudioContext();
      // 画面を離れた（phase が戻された）ら途中でやめる
      const cancelled = () => s.phase !== "starting";

      try {
        // マイクを先に確保する（許可されなかったときにセッションを作らない）
        const stream = await navigator.mediaDevices.getUserMedia(AUDIO).catch((e) => {
          throw new Error(micError(e));
        });
        s.stream = stream;
        s.recorder = await UtteranceRecorder.create(stream, ctx);

        const res = await fetch("/api/session/start", {
          method: "POST",
          // 交代の方法は接続用キーの発行時に指定し、最初から選んだモードで始める
          ...json({ scenarioId, picks, force, turnWait: s.turnWait, minutes }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 402) {
          await cleanup();
          s.phase = "idle";
          setStatus("idle");
          // hardCap: 予算の上限倍率も超えていて「それでも始める」もできない
          return { budgetExceeded: true as const, hardCap: data.error === "budget_hard_cap" };
        }
        if (!res.ok) throw new Error(data.error ?? `開始できませんでした (${res.status})`);
        s.sessionId = data.sessionId;
        s.maxMinutes = data.maxMinutes;
        s.transcription = data.transcription ?? null;
        setMaxMinutes(data.maxMinutes);
        if (cancelled()) throw new Error("cancelled");

        const pc = new RTCPeerConnection();
        s.pc = pc;
        const audio = new Audio();
        audio.autoplay = true;
        s.audio = audio;
        pc.ontrack = (e) => {
          audio.srcObject = e.streams[0];
          // 自動再生が止められても、次のタップ（「話し終えた」）やタブ復帰で再開する
          void audio.play().catch(() => {});
        };
        const track = stream.getAudioTracks()[0];
        s.sender = pc.addTrack(track, stream);
        track.onended = () => void replaceMic();

        const dc = pc.createDataChannel("oai-events");
        s.dc = dc;
        dc.onmessage = (e) => {
          try {
            onEvent(JSON.parse(e.data));
          } catch (err) {
            console.error("realtime event", err);
          }
        };
        const opened = new Promise<void>((resolve, reject) => {
          dc.onopen = () => resolve();
          pc.onconnectionstatechange = () => {
            if (pc.connectionState === "failed") reject(new Error("Realtime との接続に失敗しました"));
          };
          setTimeout(() => reject(new Error("Realtime への接続がタイムアウトしました")), CONNECT_TIMEOUT_MS);
        });
        opened.catch(() => {}); // 下の await より先に失敗しても未処理の拒否にしない

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const sdp = await fetch("https://api.openai.com/v1/realtime/calls", {
          method: "POST",
          body: offer.sdp,
          headers: { Authorization: `Bearer ${data.clientSecret}`, "Content-Type": "application/sdp" },
          signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
        });
        if (!sdp.ok) throw new Error(`Realtime 接続に失敗しました (${sdp.status})`);
        await pc.setRemoteDescription({ type: "answer", sdp: await sdp.text() });
        await opened;
        if (cancelled()) throw new Error("cancelled");

        // 接続後: 途切れたら復旧を待ち、戻らなければ切れたとみなす
        pc.onconnectionstatechange = () => {
          const state = pc.connectionState;
          if (state === "connected") {
            clearTimeout(s.lostTimer);
            setReconnecting(false);
          } else if (state === "disconnected") {
            setReconnecting(true);
            clearTimeout(s.lostTimer);
            s.lostTimer = setTimeout(lose, LOST_AFTER_MS);
          } else if (state === "failed" || state === "closed") lose();
        };
        dc.onclose = lose;
        s.hardStop = setTimeout(lose, s.maxMinutes * 60_000 + HARD_STOP_GRACE_MS);
        s.phase = "live";
        s.startedAt = Date.now();
        setStartedAt(s.startedAt);
        setStatus("live");
        send({ type: "response.create" });
        return { budgetExceeded: false as const };
      } catch (e) {
        const id = s.sessionId;
        const wasCancelled = cancelled();
        s.phase = "idle";
        s.sessionId = 0;
        await cleanup();
        if (ctx.state !== "closed") void ctx.close();
        // 始まらなかったセッションは記録に残さない
        if (id) void fetch(`/api/session/${id}/abort`, { method: "POST" }).catch(() => {});
        if (!wasCancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setStatus("error");
        }
        return { budgetExceeded: false as const };
      }
    },
    [onEvent, cleanup, send, lose, replaceMic, setAiSpeaking],
  );

  /**
   * 会話を終了する: 最後の発話を確定して文字起こしを少し待ち、未送信の発話を送り切ってから分析を依頼する。
   * 二重に呼ばれても1回だけ行う。終了の連絡は届くまで端末に控えを残す
   */
  const end = useCallback(async () => {
    const s = r.current;
    if (s.endPromise) return s.endPromise;
    if (s.phase !== "live") return s.sessionId;
    const endedAt = Date.now();
    s.phase = "ending";
    setStatus("ending");
    setReconnecting(false);
    s.endPromise = (async () => {
      // 「話し終えた」を押す前に終了した分も確定する
      commitTurn(false);
      const until = Date.now() + FLUSH_WAIT_MS;
      while ((s.ending || s.awaiting.size) && s.dc?.readyState === "open" && Date.now() < until) await sleep(100);
      const body = payload(endedAt);
      setPendingEnd(s.sessionId, body);
      await cleanup();
      setAiSpeaking(false);
      setAiThinking(false);
      await Promise.race([Promise.allSettled(s.uploads), sleep(UPLOAD_WAIT_MS)]);
      if (!(await sendEnd(s.sessionId, body))) setError("終了の送信に失敗しました。次に会話を開くときに送り直します。");
      return s.sessionId;
    })();
    return s.endPromise;
  }, [commitTurn, payload, cleanup, setAiSpeaking]);

  /** 画面を離れる（タブを閉じる・再読み込み・別ページへ）: 会話中ならその場で終了を送る（応答は待てないので控えも残す） */
  const abandon = useCallback(() => {
    const s = r.current;
    if (s.phase === "live" && s.sessionId) {
      const body = payload();
      setPendingEnd(s.sessionId, body);
      beacon(`/api/session/${s.sessionId}/end`, body);
    }
    if (s.phase === "live" || s.phase === "starting") {
      s.phase = "idle";
      void cleanup();
    }
  }, [payload, cleanup]);

  useEffect(() => {
    setTurnWaitState(loadTurnWait());
    // 前回届かなかった終了の連絡を送り直す（終了済みならサーバーは何もしない）
    for (const [id, body] of Object.entries(pendingEnds())) void sendEnd(Number(id), body);

    const onVisibility = () => {
      const s = r.current;
      if (document.visibilityState === "visible") {
        // iOS などでは裏に回ると録音・再生が止まるので、戻ったら再開する
        void s.recorder?.resume();
        if (s.audio?.srcObject) void s.audio.play().catch(() => {});
      } else checkpoint(true);
    };
    window.addEventListener("pagehide", abandon);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", abandon);
      document.removeEventListener("visibilitychange", onVisibility);
      abandon();
    };
  }, [abandon, checkpoint]);

  /** 画面の音量メーター用（録音していなければ 0） */
  const getLevel = useCallback(() => r.current.recorder?.level ?? 0, []);

  return {
    status,
    error,
    turns,
    maxMinutes,
    startedAt,
    turnWait,
    aiSpeaking,
    aiThinking,
    reconnecting,
    connectionLost,
    start,
    end,
    endTurn,
    setTurnWait,
    getLevel,
  };
}
