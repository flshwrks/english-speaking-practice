import { NextResponse } from "next/server";
import { handler, jsonError, parseId } from "@/app/api/_lib/http";
import { DRILL_MAX_SEC, DrillError, runDrill } from "@/lib/drill";
import { wavBytes } from "@/lib/wav";

export const maxDuration = 60;

/** 上限秒数の WAV＋余裕 */
const MAX_BYTES = wavBytes(DRILL_MAX_SEC + 2);

/** 言い直し練習: 添削の改善後の文を読んだ WAV を受け取り、台本あり評価で採点して保存する */
export const POST = handler<{ itemId: string }>(async (req, params) => {
  const itemId = parseId(params.itemId);
  if (!itemId) return jsonError(400, "不正な添削です");
  const tooLarge = () => jsonError(413, `録音は${DRILL_MAX_SEC}秒までです`);
  // 申告された大きさで先に断り、読んだ後も実際の大きさで確かめる（content-length は省略・偽装できる）
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES) return tooLarge();
  const wav = Buffer.from(await req.arrayBuffer());
  if (wav.length > MAX_BYTES) return tooLarge();
  try {
    return NextResponse.json(await runDrill(itemId, wav));
  } catch (e) {
    if (e instanceof DrillError) return jsonError(e.status, e.message);
    console.error("drill failed", e);
    return jsonError(500, "採点に失敗しました。もう一度どうぞ");
  }
});
