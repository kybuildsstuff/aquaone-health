import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { reconcileAll } from "@/lib/loop.server";

// Nightly Vercel Cron (vercel.json): re-reads every AquaOne Health subscription from Loop
// and corrects members rows, catching any webhook Loop failed to deliver.
// Vercel sends "Authorization: Bearer $CRON_SECRET" when CRON_SECRET is set on the project.
export const maxDuration = 300;

function authorised(header: string | null, secret: string) {
  const a = Buffer.from(header ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("loop_reconcile_failed cron_secret_missing");
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }
  if (!authorised(request.headers.get("authorization"), secret)) {
    console.error("loop_reconcile_failed unauthorised");
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  try {
    const summary = await reconcileAll();
    console.log("loop_reconcile", JSON.stringify(summary));
    return NextResponse.json(summary, { status: summary.errors ? 500 : 200 });
  } catch (e) {
    console.error("loop_reconcile_failed exception", (e as Error).message);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
