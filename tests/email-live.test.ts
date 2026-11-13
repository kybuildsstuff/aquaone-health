// Opt-in live test: sends ONE real welcome email (and, with EMAIL_LIVE_TRIAL=1, one real
// trial-ending email) through Resend with the real key, to the address you give.
//   EMAIL_LIVE=1 EMAIL_LIVE_TO=you@example.com npx vitest run tests/email-live.test.ts
// Skipped (NOT RUN) otherwise. It writes no members row; each send is logged in email_log
// with no member and kind "test:<kind>", which is the record that it went out.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

config({ path: ".env.local", quiet: true });
const LIVE = process.env.EMAIL_LIVE === "1" && Boolean(process.env.EMAIL_LIVE_TO);
if (!LIVE) console.log("email-live: NOT RUN (set EMAIL_LIVE=1 and EMAIL_LIVE_TO to run it)");

describe.skipIf(!LIVE)("live email through Resend", () => {
  it("sends the welcome email for real", async () => {
    const { sendViaResend } = await import("../src/lib/email.server");
    const { welcomeEmail, trialEndingEmail } = await import("../src/lib/email");
    const to = process.env.EMAIL_LIVE_TO!;
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
    const sends: [string, ReturnType<typeof welcomeEmail>][] = [["welcome", welcomeEmail()]];
    if (process.env.EMAIL_LIVE_TRIAL === "1") sends.push(["trial_ending", trialEndingEmail(new Date(Date.now() + 3 * 86400_000).toISOString(), "America/New_York")]);
    for (const [kind, msg] of sends) {
      const r = await sendViaResend(to, msg);
      await admin.from("email_log").insert({ member_id: null, to_email: to, kind: `test:${kind}`, provider_id: r.ok ? r.id : null, status: r.ok ? "sent" : "failed" });
      console.log(`email-live ${kind}:`, r.ok ? `sent (Resend id ${r.id})` : r.error);
      expect(r.ok).toBe(true);
    }
  });
});
