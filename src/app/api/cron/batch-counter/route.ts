import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runBatchCounter } from "@/lib/batch-counter.server";

// Hourly Vercel Cron (vercel.json): the Black Friday stock card's real fountain count (see
// src/lib/batch-counter.ts). Vercel sends "Authorization: Bearer $CRON_SECRET".
export const maxDuration = 300;

function authorised(header: string | null, secret: string) {
  const a = Buffer.from(header ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 500 });
  if (!authorised(request.headers.get("authorization"), secret)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  try {
    const r = await runBatchCounter();
    console.log("batch_counter", JSON.stringify(r));
    return NextResponse.json(r);
  } catch (e) {
    console.error("batch_counter_failed", (e as Error).message);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
