"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Turn } from "@/db/schema";
import type { RealtimeUsage } from "@/lib/config";
import type { ExpressionPick } from "@/lib/expressions";
import { saveUtterance } from "./audio-store";
import { SAMPLE_RATE, toWav, UtteranceRecorder } from "./recorder";

/** ref は Realtime API の item_id / response_id */
export type LiveTurn = Turn & { ref: string };

type Status = "idle" | "connecting" | "live" | "ending" | "error";

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
    speech: new Map<string, { seq: number; startIdx: number; startMs: number }>(),
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
        if (!sp || !s.recorder) break;
        const durationMs = ev.audio_end_ms - sp.startMs;
        if (durationMs < MIN_SPEECH_MS) break;
        const end = s.recorder.position;
        const wav = toWav(s.recorder.slice(Math.max(sp.startIdx, end - MAX_CLIP), end));
        void saveUtterance(s.sessionId, sp.seq, wav);
        s.uploads.push(
          fetch(`/api/session/${s.sessionId}/utterance?seq=${sp.seq}&durationMs=${durationMs}`, {
            method: "POST",
            body: wav,
          }).catch((e) => console.error("upload failed", e)),
        );
        break;
      }
      case "conversation.item.input_audio_transcription.completed":
        patchTurn(ev.item_id, (t) => ({ ...t, text: ev.transcript ?? "" }));
        break;
      case "response.created":
        updateTurns((ts) => [...ts, { role: "assistant", text: "", ref: ev.response.id }]);
        break;
      case "response.output_audio_transcript.delta":
        patchTurn(ev.response_id, (t) => ({ ...t, text: t.text + ev.delta }));
        break;
      case "response.output_audio_transcript.done":
        patchTurn(ev.response_id, (t) => ({ ...t, text: ev.transcript }));
        break;
      case "response.done":
        if (ev.response?.usage) s.usage = addUsage(s.usage, ev.response.usage);
        break;
      case "error":
        console.error("realtime error", ev.error);
        break;
    }
  }, [updateTurns, patchTurn]);

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
    async (scenarioId: string, picks: ExpressionPick[], force = false) => {
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
        dc.onmessage = (e) => onEvent(JSON.parse(e.data));
        dc.onopen = () => {
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
    [onEvent, cleanup],
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

  return { status, error, turns, maxMinutes, startedAt, start, end };
}
