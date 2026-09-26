import { NextResponse } from "next/server";
import type { ExpressionPick } from "@/lib/expressions";
import { startSession } from "@/lib/session";

export async function POST(req: Request) {
  const body = (await req.json()) as { scenarioId: string; picks: ExpressionPick[]; force?: boolean };
  try {
    const result = await startSession(body);
    if (result.ok) return NextResponse.json(result);
    return NextResponse.json({ error: result.reason }, { status: result.reason === "budget" ? 402 : 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
