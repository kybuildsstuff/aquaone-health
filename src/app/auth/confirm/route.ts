import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";
import { linkMember } from "@/lib/members.server";

// The link in the sign-in email lands here (token_hash flow, see docs/supabase-dashboard-settings.md).
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = (request.nextUrl.searchParams.get("type") ?? "email") as EmailOtpType;
  const to = request.nextUrl.clone();
  to.search = "";

  if (tokenHash) {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error && data.user?.email) {
      await linkMember(data.user.id, data.user.email);
      to.pathname = "/start";
      return NextResponse.redirect(to);
    }
  }
  to.pathname = "/sign-in";
  to.searchParams.set("error", "link_expired");
  return NextResponse.redirect(to);
}
