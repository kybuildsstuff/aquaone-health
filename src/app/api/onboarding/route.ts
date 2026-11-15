import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { catRow, onboardingSchema } from "@/lib/onboarding";
import { findMember } from "@/lib/members.server";
import { membershipAllows } from "@/lib/membership";
import { MAX_CATS } from "@/lib/cats";
import { rememberCat } from "@/lib/cats-actions.server";

// Saves the onboarding answers as her cat and her reminder settings. With { add: true } it adds
// another cat (Every cat in the house): only the cat is saved, up to MAX_CATS active cats.
export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user?.email) {
    console.error("onboarding_failed signed_out");
    return NextResponse.json({ error: "signed_out" }, { status: 401 });
  }
  if (!membershipAllows(await findMember(user.email)).allowed) {
    console.error("onboarding_failed not_member", user.id);
    return NextResponse.json({ error: "not_member" }, { status: 403 });
  }

  const raw = await request.json().catch(() => null);
  const add = raw?.add === true;
  const parsed = onboardingSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("onboarding_failed invalid", user.id, JSON.stringify(parsed.error.issues.map((i) => [i.path.join("."), i.message])));
    return NextResponse.json({ error: "invalid", issues: parsed.error.issues.map((i) => i.path.join(".")) }, { status: 400 });
  }
  const o = parsed.data;

  const prefs = {
    user_id: user.id,
    by_email: o.remindByEmail,
    by_text: false, // text reminders come after launch
    checkin_time: o.checkinTime,
    timezone: o.timezone,
  };

  const { count } = await supabase.from("cats").select("id", { count: "exact", head: true }).is("archived_at", null);
  if (add && count && count > 0) {
    if (count >= MAX_CATS) {
      console.error("onboarding_failed cat_limit", user.id);
      return NextResponse.json({ error: "cat_limit" }, { status: 409 });
    }
    const { data: added, error: addError } = await supabase.from("cats").insert(catRow(o, user.id)).select("id").single();
    if (addError) {
      // The database guard (cats_limit trigger) catches two adds racing past the count above.
      const limit = addError.message.includes("cat_limit");
      console.error(`onboarding_failed ${limit ? "cat_limit" : "cat_insert"}`, user.id, addError.message);
      return NextResponse.json({ error: limit ? "cat_limit" : "save_failed" }, { status: limit ? 409 : 500 });
    }
    await rememberCat(added.id);
    return NextResponse.json({ ok: true, catId: added.id });
  }
  if (count && count > 0) {
    // A retry after the cat saved but the settings didn't: write the settings if they're still
    // missing (never overwrite ones she has changed since), so her timezone isn't left on the default.
    await supabase.from("reminder_prefs").upsert(prefs, { onConflict: "user_id", ignoreDuplicates: true });
    return NextResponse.json({ error: "already_onboarded", next: "/today" }, { status: 409 });
  }

  // Settings first: if the cat then fails to save, a retry starts clean; if the settings fail,
  // nothing has been saved yet.
  const { error: prefError } = await supabase.from("reminder_prefs").upsert(prefs);
  if (prefError) {
    console.error("onboarding_failed prefs_upsert", user.id, prefError.message);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  const { data: cat, error: catError } = await supabase.from("cats").insert(catRow(o, user.id)).select("id").single();
  if (catError) {
    console.error("onboarding_failed cat_insert", user.id, catError.message);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, catId: cat.id });
}
