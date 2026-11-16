import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runDailyEmails, runRetentionEmails } from "@/lib/email.server";

// Daily Vercel Cron (vercel.json): the trial-ending reminder (free month ends in 7-9 days) and
// a catch-up for any welcome email the Loop webhook couldn't send, and (retention v1) the monthly
// summary 3 days before each charge (no billing in it) and the 5-day nudge.
// Vercel sends "Authorization: Bearer $CRON_SECRET" when CRON_SECRET is set on the project.
export const maxDuration = 800;

function authorised(header: string | null, secret: string) {
  const a = Buffer.from(header ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("email_cron_failed cron_secret_missing");
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }
  if (!authorised(request.headers.get("authorization"), secret)) {
    console.error("email_cron_failed unauthorised");
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  try {
    const retention = await runRetentionEmails();
    const daily = await runDailyEmails();
    const summary = { ...daily, ...retention, errors: daily.errors + retention.errors };
    console.log("email_cron", JSON.stringify(summary));
    return NextResponse.json(summary, { status: summary.errors ? 500 : 200 });
  } catch (e) {
    console.error("email_cron_failed exception", (e as Error).message);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
