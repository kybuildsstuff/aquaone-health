import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { linkMember } from "@/lib/members.server";

// Called right after a code is verified in the browser: links the member row to this user.
export async function POST() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user?.email) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  await linkMember(data.user.id, data.user.email);
  return NextResponse.json({ next: "/start" });
}
