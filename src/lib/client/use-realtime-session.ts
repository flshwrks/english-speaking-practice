"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Turn } from "@/db/schema";
import type { RealtimeUsage } from "@/lib/config";
import type { ExpressionPick } from "@/lib/expressions";
import { saveUtterance } from "./audio-store";
import { SAMPLE_RATE, toWav, UtteranceRecorder, voicedMs } from "./recorder";

/** ref は Realtime API の item_id / response_id */
export type LiveTurn = Turn & { ref: string };

type Status = "idle" | "connecting" | "live" | "ending" | "error";
/** manual: 「話し終えた」を押すまで待つ / low・medium: 自動判定（semantic VAD）の待ち方 */
export type TurnWait = "manual" | "low" | "medium";

/** VAD の検出遅延ぶん、発話開始より前から切り出す */
const PRE_ROLL = Math.round(SAMPLE_RATE * 1.2);
const MIN_SPEECH_MS = 400;
const MAX_CLIP = SAMPLE_RATE * 60;

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

  const r = useRef({
    pc: null as RTCPeerConnection | null,
    stream: null as MediaStream | null,
    recorder: null as UtteranceRecorder | null,
    turns: [] as LiveTurn[],
    usage: {} as NumTree,
    seq: 0,
    dc: null as RTCDataChannel | null,
    turnWait: "manual" as TurnWait,
    /** 自動モードで「話し終えた」を押し、自動判定を止めている間 true */
    endingTurn: false,
    /** 手動モード: 自分の番が始まった位置（録音のサンプル位置） */
    manualStart: 0,
    /** 手動モードで確定したターンの仮 ID。committed で届く item_id と対応づける */
    pendingManualRef: null as string | null,
    alias: new Map<string, string>(),
    speech: new Map<string, { seq: number; startIdx: number; startMs: number; done?: boolean }>(),
    uploads: [] as Promise<unknown>[],
    sessionId: 0,
  });

  const updateTurns = useCallback((fn: (turns: LiveTurn[]) => LiveTurn[]) => {
    r.current.turns = fn(r.current.turns);
    setTurns(r.current.turns);
  }, []);
  const patchTurn = useCallback(
    (ref: string, fn: (t: LiveTurn) => LiveTurn) =>
      updateTurns((ts) => ts.map((t) => (t.ref === ref ? fn(t) : t))),
    [updateTurns],
  );

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

  /** 話し終わりの自動判定を設定する（manual / null で止める） */
  const sendEagerness = useCallback((wait: TurnWait | null) => {
    const dc = r.current.dc;
    if (dc?.readyState !== "open") return;
    const turnDetection = wait && wait !== "manual" ? { type: "semantic_vad", eagerness: wait } : null;
    dc.send(
      JSON.stringify({
        type: "session.update",
        session: { type: "realtime", audio: { input: { turn_detection: turnDetection } } },
      }),
    );
  }, []);

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
      case "input_audio_buffer.committed":
        if (s.pendingManualRef) {
          s.alias.set(ev.item_id, s.pendingManualRef);
          s.pendingManualRef = null;
        }
        break;
      case "conversation.item.input_audio_transcription.completed":
        patchTurn(s.alias.get(ev.item_id) ?? ev.item_id, (t) => ({ ...t, text: ev.transcript ?? "" }));
        break;
      case "response.created":
        updateTurns((ts) => [...ts, { role: "assistant", text: "", ref: ev.response.id }]);
        if (s.endingTurn) {
          s.endingTurn = false;
          sendEagerness(s.turnWait);
        }
        break;
      case "response.output_audio_transcript.delta":
        patchTurn(ev.response_id, (t) => ({ ...t, text: t.text + ev.delta }));
        break;
      case "response.output_audio_transcript.done":
        patchTurn(ev.response_id, (t) => ({ ...t, text: ev.transcript }));
        break;
      case "response.done":
        if (ev.response?.usage) s.usage = addUsage(s.usage, ev.response.usage);
        // 手動モードでは、AI の応答が終わった位置から自分の番とみなす
        if (s.recorder) s.manualStart = s.recorder.position;
        break;
      case "error":
        console.error("realtime error", ev.error);
        // 確定に失敗しても「話し終えた」が効かなくならないよう状態を戻す
        s.pendingManualRef = null;
        if (s.endingTurn) {
          s.endingTurn = false;
          sendEagerness(s.turnWait);
        }
        break;
    }
  }, [updateTurns, patchTurn, finalizeSpeech, sendEagerness]);


  /** 話し終わりの自動判定の待ち方を会話中に切り替える（low: 考えながら話す / medium: 標準） */
  const setTurnWait = useCallback(
    (eagerness: TurnWait) => {
      r.current.turnWait = eagerness;
      sendEagerness(eagerness);
    },
    [sendEagerness],
  );

  /**
   * 「話し終えた」: 自動判定をいったん止めてから、ここまでの発話を確定して AI に応答させる。
   * 自動判定を止めずに確定すると、残りの音声が別の発話とみなされて AI が二重に応答するため。
   * 自動判定は AI の応答が始まったら元に戻す（response.created）。
   */
  const endTurn = useCallback(() => {
    const s = r.current;
    if (!s.dc || s.dc.readyState !== "open" || !s.recorder || s.endingTurn || s.pendingManualRef) return;
    const end = s.recorder.position;

    if (s.turnWait === "manual") {
      // 手動: AI が話し終えてからここまでを1発話とする（自動判定は使わない）
      const pcm = s.recorder.slice(Math.max(s.manualStart, end - MAX_CLIP), end);
      const voiced = voicedMs(pcm);
      if (voiced < MIN_SPEECH_MS) return;
      const seq = ++s.seq;
      const ref = `manual-${seq}`;
      s.pendingManualRef = ref;
      s.manualStart = end;
      updateTurns((ts) => [...ts, { role: "user", text: "", seq, ref }]);
      uploadClip(seq, pcm, voiced);
    } else {
      const pending = [...s.speech.entries()].filter(([, sp]) => !sp.done).at(-1);
      if (!pending) return;
      const [itemId, sp] = pending;
      s.endingTurn = true;
      sendEagerness(null);
      finalizeSpeech(itemId, ((end - sp.startIdx - PRE_ROLL) * 1000) / SAMPLE_RATE);
    }
    s.dc.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    s.dc.send(JSON.stringify({ type: "response.create" }));
  }, [sendEagerness, finalizeSpeech, uploadClip, updateTurns]);

  const cleanup = useCallback(async () => {
    const s = r.current;
    s.pc?.close();
    s.stream?.getTracks().forEach((t) => t.stop());
    await s.recorder?.close();
    s.pc = null;
    s.stream = null;
    s.recorder = null;
  }, []);

  const start = useCallback(
    async (scenarioId: string, picks: ExpressionPick[], opts: { force?: boolean; turnWait?: TurnWait } = {}) => {
      const force = opts.force ?? false;
      setError(null);
      setStatus("connecting");
      try {
        const res = await fetch("/api/session/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scenarioId, picks, force }),
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
          // サーバー側の初期値は low。標準を選んでいれば切り替えてから始める
          s.turnWait = opts.turnWait ?? "manual";
          if (s.turnWait !== "low") sendEagerness(s.turnWait); // サーバー側の初期値は low
          dc.send(JSON.stringify({ type: "response.create" }));
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
    [onEvent, cleanup, sendEagerness],
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

  return { status, error, turns, maxMinutes, startedAt, start, end, endTurn, setTurnWait };
}
