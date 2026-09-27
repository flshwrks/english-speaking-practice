"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Turn } from "@/db/schema";
import { turnDetectionFor, TURN_WAITS, type RealtimeUsage, type TurnWait } from "@/lib/config";
import type { ExpressionPick } from "@/lib/expressions";
import { saveUtterance } from "./audio-store";
import { SAMPLE_RATE, toWav, UtteranceRecorder, voicedMs } from "./recorder";

export type { TurnWait };

/** ref は Realtime API の item_id / response_id */
export type LiveTurn = Turn & { ref: string };

type Status = "idle" | "connecting" | "live" | "ending" | "error";

/** VAD の検出遅延ぶん、発話開始より前から切り出す */
const PRE_ROLL = Math.round(SAMPLE_RATE * 1.2);
const MIN_SPEECH_MS = 400;
const MAX_CLIP = SAMPLE_RATE * 60;

const TURN_WAIT_KEY = "esp-turn-wait";

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

export function useRealtimeSession() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<LiveTurn[]>([]);
  const [maxMinutes, setMaxMinutes] = useState(15);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  // 交代の方法は画面表示用の state と、イベント処理から読む ref の両方に持つ（更新は setTurnWait だけ）。
  // 切り替えボタンは会話中にしか出ないので、保存値の読み込みでサーバー描画と食い違うことはない
  const [turnWait, setTurnWaitState] = useState<TurnWait>(loadTurnWait);
  /** AI が音声を再生中か（画面の「AI が話しています」表示用） */
  const [aiSpeaking, setAiSpeaking] = useState(false);

  const r = useRef({
    pc: null as RTCPeerConnection | null,
    dc: null as RTCDataChannel | null,
    stream: null as MediaStream | null,
    recorder: null as UtteranceRecorder | null,
    turns: [] as LiveTurn[],
    usage: {} as NumTree,
    seq: 0,
    turnWait: "manual" as TurnWait,
    /**
     * 「話し終えた」を押してから AI 側で確定するまでの状態。
     * auto: 自動判定を一時停止中（応答が始まったら戻す） / manual: 手動で確定した発話の番号（committed で会話に加える）
     */
    ending: null as null | { mode: "auto" } | { mode: "manual"; seq: number },
    /** 手動モード: 自分の番が始まった位置（録音のサンプル位置）。AI 側の音声バッファもここで区切る */
    manualStart: 0,
    speech: new Map<string, { seq: number; startIdx: number; startMs: number; done?: boolean }>(),
    uploads: [] as Promise<unknown>[],
    sessionId: 0,
  });

  useEffect(() => {
    r.current.turnWait = turnWait;
  }, [turnWait]);

  const updateTurns = useCallback((fn: (turns: LiveTurn[]) => LiveTurn[]) => {
    r.current.turns = fn(r.current.turns);
    setTurns(r.current.turns);
  }, []);
  const patchTurn = useCallback(
    (ref: string, fn: (t: LiveTurn) => LiveTurn) =>
      updateTurns((ts) => ts.map((t) => (t.ref === ref ? fn(t) : t))),
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

  /** 1発話分の録音を端末に保存し、発音評価に送る */
  const uploadClip = useCallback((seq: number, pcm: Int16Array, durationMs: number) => {
    const s = r.current;
    const wav = toWav(pcm);
    void saveUtterance(s.sessionId, seq, wav);
    s.uploads.push(
      fetch(`/api/session/${s.sessionId}/utterance?seq=${seq}&durationMs=${Math.round(durationMs)}`, {
        method: "POST",
        body: wav,
      }).catch((e) => console.error("upload failed", e)),
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
      uploadClip(sp.seq, s.recorder.slice(Math.max(sp.startIdx, end - MAX_CLIP), end), durationMs);
    },
    [uploadClip],
  );

  // Realtime API のサーバーイベント（型は公式ドキュメント参照。ここでは必要なフィールドだけ読む）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onEvent = useCallback((ev: Record<string, any>) => {
    const s = r.current;
    switch (ev.type) {
      case "input_audio_buffer.speech_started": {
        const seq = ++s.seq;
        s.speech.set(ev.item_id, {
          seq,
          startIdx: s.recorder!.position - PRE_ROLL,
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
        // 手動で確定した発話は、AI 側の item_id が決まったここで会話に加える
        const ending = s.ending;
        if (ending?.mode === "manual") {
          updateTurns((ts) => [...ts, { role: "user", text: "", seq: ending.seq, ref: ev.item_id }]);
          s.ending = null;
        }
        break;
      }
      case "conversation.item.input_audio_transcription.completed":
        patchTurn(ev.item_id, (t) => ({ ...t, text: ev.transcript ?? "" }));
        break;
      case "output_audio_buffer.started":
        setAiSpeaking(true);
        break;
      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared":
        setAiSpeaking(false);
        break;
      case "response.created":
        updateTurns((ts) => [...ts, { role: "assistant", text: "", ref: ev.response.id }]);
        if (s.ending?.mode === "auto") finishEnding();
        break;
      case "response.output_audio_transcript.delta":
        patchTurn(ev.response_id, (t) => ({ ...t, text: t.text + ev.delta }));
        break;
      case "response.output_audio_transcript.done":
        patchTurn(ev.response_id, (t) => ({ ...t, text: ev.transcript }));
        break;
      case "response.done":
        if (ev.response?.usage) s.usage = addUsage(s.usage, ev.response.usage);
        // 手動モード: AI の応答が終わったところから自分の番。録音と AI 側の音声バッファを同じ位置で区切り、
        // 文字起こしされる音声と発音評価に送る音声の範囲をそろえる
        if (s.turnWait === "manual" && s.recorder) {
          s.manualStart = s.recorder.position;
          send({ type: "input_audio_buffer.clear" });
        }
        break;
      case "error":
        console.error("realtime error", ev.error);
        // 確定に失敗しても「話し終えた」が効かなくならないよう状態を戻す
        finishEnding();
        break;
    }
  }, [updateTurns, patchTurn, finalizeSpeech, finishEnding, send]);

  /** 交代の方法を切り替える（会話中でも可）。選択は次回のために保存する */
  const setTurnWait = useCallback(
    (wait: TurnWait) => {
      r.current.turnWait = wait;
      setTurnWaitState(wait);
      sendTurnDetection(wait);
      try {
        localStorage.setItem(TURN_WAIT_KEY, wait);
      } catch {}
    },
    [sendTurnDetection],
  );

  /**
   * 「話し終えた」: ここまでの発話を確定して AI に応答させる。
   * 自動モードでは自動判定をいったん止めてから確定する（止めないと残りの音声が別の発話とみなされ、AI が二重に応答する）。
   */
  const endTurn = useCallback(() => {
    const s = r.current;
    if (s.dc?.readyState !== "open" || !s.recorder || s.ending) return;
    const end = s.recorder.position;

    if (s.turnWait === "manual") {
      // 手動: AI が話し終えてからここまでを1発話とする（自動判定は使わない）
      const pcm = s.recorder.slice(Math.max(s.manualStart, end - MAX_CLIP), end);
      const voiced = voicedMs(pcm);
      if (voiced < MIN_SPEECH_MS) return;
      const seq = ++s.seq;
      s.ending = { mode: "manual", seq };
      s.manualStart = end;
      uploadClip(seq, pcm, voiced);
    } else {
      const pending = [...s.speech.entries()].filter(([, sp]) => !sp.done).at(-1);
      if (!pending) return;
      const [itemId, sp] = pending;
      s.ending = { mode: "auto" };
      sendTurnDetection("manual");
      finalizeSpeech(itemId, ((end - sp.startIdx - PRE_ROLL) * 1000) / SAMPLE_RATE);
    }
    send({ type: "input_audio_buffer.commit" });
    send({ type: "response.create" });
  }, [send, sendTurnDetection, finalizeSpeech, uploadClip]);

  const cleanup = useCallback(async () => {
    const s = r.current;
    s.pc?.close();
    s.stream?.getTracks().forEach((t) => t.stop());
    await s.recorder?.close();
    s.pc = null;
    s.dc = null;
    s.stream = null;
    s.recorder = null;
  }, []);

  const start = useCallback(
    async (scenarioId: string, picks: ExpressionPick[], force = false) => {
      setError(null);
      setStatus("connecting");
      try {
        const res = await fetch("/api/session/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // 交代の方法は接続用キーの発行時に指定し、最初から選んだモードで始める
          body: JSON.stringify({ scenarioId, picks, force, turnWait: r.current.turnWait }),
        });
        const data = await res.json();
        if (res.status === 402) {
          setStatus("idle");
          return { budgetExceeded: true as const };
        }
        if (!res.ok) throw new Error(data.error ?? "start failed");

        const s = r.current;
        s.sessionId = data.sessionId;
        setMaxMinutes(data.maxMinutes);

        s.stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        s.recorder = await UtteranceRecorder.create(s.stream);

        const pc = new RTCPeerConnection();
        s.pc = pc;
        const audio = new Audio();
        audio.autoplay = true;
        pc.ontrack = (e) => (audio.srcObject = e.streams[0]);
        pc.addTrack(s.stream.getAudioTracks()[0], s.stream);

        const dc = pc.createDataChannel("oai-events");
        s.dc = dc;
        dc.onmessage = (e) => onEvent(JSON.parse(e.data));
        dc.onopen = () => {
          send({ type: "response.create" });
          setStartedAt(Date.now());
          setStatus("live");
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const sdp = await fetch("https://api.openai.com/v1/realtime/calls", {
          method: "POST",
          body: offer.sdp,
          headers: { Authorization: `Bearer ${data.clientSecret}`, "Content-Type": "application/sdp" },
        });
        if (!sdp.ok) throw new Error(`Realtime 接続に失敗しました (${sdp.status})`);
        await pc.setRemoteDescription({ type: "answer", sdp: await sdp.text() });
        return { budgetExceeded: false as const };
      } catch (e) {
        await cleanup();
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
        return { budgetExceeded: false as const };
      }
    },
    [onEvent, cleanup, send],
  );

  /** 会話を終了し、未送信の発話を送り切ってから分析を依頼する */
  const end = useCallback(async () => {
    const s = r.current;
    setStatus("ending");
    const durationSec = startedAt ? (Date.now() - startedAt) / 1000 : 0;
    await cleanup();
    await Promise.allSettled(s.uploads);
    const turns: Turn[] = s.turns
      .filter((t) => t.text.trim())
      .map((t) => ({ role: t.role, text: t.text.trim(), seq: t.seq })); // assistant の seq は undefined で送られない
    await fetch(`/api/session/${s.sessionId}/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turns, durationSec, realtimeUsage: s.usage as RealtimeUsage }),
    });
    return s.sessionId;
  }, [cleanup, startedAt]);

  useEffect(() => () => void cleanup(), [cleanup]);

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
    start,
    end,
    endTurn,
    setTurnWait,
    getLevel,
  };
}
