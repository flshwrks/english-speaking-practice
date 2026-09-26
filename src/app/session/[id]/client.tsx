"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { loadUtterance, purgeOldUtterances } from "@/lib/client/audio-store";

export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}

/** 端末に保存した自分の録音を再生する（別端末・30日経過後は表示しない） */
export function MyRecording({ sessionId, seq }: { sessionId: number; seq: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let objectUrl: string | null = null;
    loadUtterance(sessionId, seq).then((blob) => {
      if (!blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sessionId, seq]);
  if (!url) return null;
  return (
    <button type="button" className="btn shrink-0 px-2 py-1 text-xs" onClick={() => new Audio(url).play()}>
      ▶ 自分の声
    </button>
  );
}

export function PurgeOldAudio() {
  useEffect(() => {
    void purgeOldUtterances();
  }, []);
  return null;
}
