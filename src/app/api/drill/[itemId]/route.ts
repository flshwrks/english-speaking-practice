import { NextResponse } from "next/server";
import { DRILL_MAX_SEC, DrillError, runDrill } from "@/lib/drill";

export const maxDuration = 60;

/** 上限秒数の WAV＋余裕。これを超える本文は読まずに断る */
const MAX_BYTES = 44 + (DRILL_MAX_SEC + 2) * 16000 * 2;

/** 言い直し練習: 添削の改善後の文を読んだ WAV を受け取り、台本あり評価で採点して保存する */
export async function POST(req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const itemId = Number((await params).itemId);
  if (!Number.isInteger(itemId) || itemId <= 0) return NextResponse.json({ error: "不正な添削です" }, { status: 400 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES) {
    return NextResponse.json({ error: `録音は${DRILL_MAX_SEC}秒までです` }, { status: 413 });
  }
  try {
    return NextResponse.json(await runDrill(itemId, Buffer.from(await req.arrayBuffer())));
  } catch (e) {
    if (e instanceof DrillError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("drill failed", e);
    return NextResponse.json({ error: "採点に失敗しました。もう一度どうぞ" }, { status: 500 });
  }
}
