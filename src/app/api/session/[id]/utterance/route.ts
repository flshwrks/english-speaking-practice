import { NextResponse } from "next/server";
import { db, t } from "@/db";
import { assessPronunciation, azureConfigured, EMPTY_ASSESSMENT } from "@/lib/azure";

export const maxDuration = 60;

/** 発話1つ分の WAV を受け取り、Azure で発音評価して保存する（会話と並行して呼ばれる） */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessionId = Number((await params).id);
  const url = new URL(req.url);
  const seq = Number(url.searchParams.get("seq"));
  const durationMs = Number(url.searchParams.get("durationMs") ?? 0);
  const wav = Buffer.from(await req.arrayBuffer());

  const assessment = azureConfigured()
    ? await assessPronunciation(wav).catch((e) => {
        console.error("azure assessment failed", e);
        return null;
      })
    : null;

  const values = { sessionId, seq, durationMs, ...(assessment ?? EMPTY_ASSESSMENT) };
  await db()
    .insert(t.utterances)
    .values(values)
    .onConflictDoUpdate({ target: [t.utterances.sessionId, t.utterances.seq], set: values });

  return NextResponse.json({ ok: true, assessed: Boolean(assessment) });
}
