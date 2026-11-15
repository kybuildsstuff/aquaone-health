import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { deleteOldAskPhotos } from "@/lib/ask.server";

// Daily Vercel Cron (vercel.json): photos sent to Ask are kept 90 days (Ky, 15 Nov), then
// deleted from storage; the question and the photo's one-line description stay.
export const maxDuration = 300;

function authorised(header: string | null, secret: string) {
  const a = Buffer.from(header ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("ask_photos_cron_failed cron_secret_missing");
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }
  if (!authorised(request.headers.get("authorization"), secret)) {
    console.error("ask_photos_cron_failed unauthorised");
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  try {
    const summary = await deleteOldAskPhotos();
    console.log("ask_photos_cron", JSON.stringify(summary));
    return NextResponse.json(summary);
  } catch (e) {
    console.error("ask_photos_cron_failed exception", (e as Error).message);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
