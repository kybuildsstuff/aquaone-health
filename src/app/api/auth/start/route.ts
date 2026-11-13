import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { gateForEmail } from "@/lib/members.server";
import { normaliseEmail } from "@/lib/membership";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";

const body = z.object({ email: z.string().trim().email() });

// Step 1 of sign-in: only members get a code. Sends the email with the 6-digit code and link.
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  const email = normaliseEmail(parsed.data.email);

  const gate = await gateForEmail(email);
  if (!gate.allowed) return NextResponse.json({ error: gate.reason }, { status: 403 });

  // A plain client (no PKCE cookie): the code and the token_hash link both verify without one.
  const supabase = createClient(supabaseUrl(), supabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false, flowType: "implicit" },
  });
  const origin = new URL(request.url).origin;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: `${origin}/auth/confirm` },
  });
  if (error) {
    const rateLimited = error.status === 429;
    return NextResponse.json({ error: rateLimited ? "rate_limited" : "send_failed" }, { status: rateLimited ? 429 : 502 });
  }
  return NextResponse.json({ ok: true });
}
