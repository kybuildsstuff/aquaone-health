import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";
import { findMember } from "@/lib/members.server";
import { membershipAllows } from "@/lib/membership";
import type { ActionResult } from "@/lib/app-data.server";

// The shared shape of every member API route: signed in, a member with access today,
// a valid body, then the action. Every failure is logged with its reason
// (`<route>_failed <reason> <user id> ...`) and answered with a specific error code.
export async function memberRoute<S extends z.ZodType, T>(
  route: string,
  request: Request,
  schema: S,
  action: (supabase: SupabaseClient, input: z.output<S>) => Promise<ActionResult<T>>,
) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user?.email) {
      console.error(`${route}_failed signed_out`);
      return NextResponse.json({ error: "signed_out" }, { status: 401 });
    }
    if (!membershipAllows(await findMember(user.email)).allowed) {
      console.error(`${route}_failed not_member`, user.id);
      return NextResponse.json({ error: "not_member" }, { status: 403 });
    }
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      console.error(`${route}_failed invalid`, user.id, JSON.stringify(parsed.error.issues.map((i) => [i.path.join("."), i.message])));
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    const result = await action(supabase, parsed.data);
    if (!result.ok) {
      console.error(`${route}_failed ${result.error}`, user.id, result.detail ?? "");
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, ...result.data });
  } catch (e) {
    console.error(`${route}_failed exception`, e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
