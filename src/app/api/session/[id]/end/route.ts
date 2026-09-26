import { NextResponse } from "next/server";
import { finishSession } from "@/lib/session";

export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await finishSession(Number((await params).id), await req.json());
  return NextResponse.json({ ok: true });
}
