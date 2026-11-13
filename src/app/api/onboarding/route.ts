import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { catRow, onboardingSchema } from "@/lib/onboarding";
import { findMember } from "@/lib/members.server";
import { membershipAllows } from "@/lib/membership";

// Saves the onboarding answers as her cat (version 1: one cat per member) and her reminder settings.
export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user?.email) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  if (!membershipAllows(await findMember(user.email)).allowed) {
    return NextResponse.json({ error: "not_member" }, { status: 403 });
  }

  const parsed = onboardingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", issues: parsed.error.issues.map((i) => i.path.join(".")) }, { status: 400 });
  }
  const o = parsed.data;

  const { count } = await supabase.from("cats").select("id", { count: "exact", head: true });
  if (count && count > 0) return NextResponse.json({ error: "already_onboarded", next: "/today" }, { status: 409 });

  const { data: cat, error: catError } = await supabase.from("cats").insert(catRow(o, user.id)).select("id").single();
  if (catError) return NextResponse.json({ error: "save_failed" }, { status: 500 });

  const { error: prefError } = await supabase.from("reminder_prefs").upsert({
    user_id: user.id,
    by_email: o.remindByEmail,
    by_text: false, // text reminders come after launch
    checkin_time: o.checkinTime,
    timezone: o.timezone,
  });
  if (prefError) return NextResponse.json({ error: "save_failed" }, { status: 500 });

  return NextResponse.json({ ok: true, catId: cat.id });
}
