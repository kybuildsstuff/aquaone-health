import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { findMember } from "@/lib/members.server";
import { membershipAllows } from "@/lib/membership";
import { PHOTO_MAX_BYTES, PHOTO_TYPES, type PhotoType } from "@/lib/safe";
import { saveLabReport } from "@/lib/bloodwork.server";
import { anthropicLabReader } from "@/lib/bloodwork-vision.server";
import { IdentifyError } from "@/lib/safe-vision.server";

export const maxDuration = 90;

// Bloodwork, explained: a photo of a lab report (multipart field "photo") becomes a saved panel for
// the cat the screen showed. Same checks as every member route, then the photo checks.
export async function POST(request: Request) {
  const route = "bloodwork_add";
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
    const form = await request.formData().catch(() => null);
    const file = form?.get("photo");
    if (!(file instanceof Blob)) {
      console.error(`${route}_failed no_photo`, user.id);
      return NextResponse.json({ error: "no_photo" }, { status: 400 });
    }
    if (!PHOTO_TYPES.includes(file.type as PhotoType)) {
      console.error(`${route}_failed bad_type`, user.id, file.type || "(none)");
      return NextResponse.json({ error: "bad_type" }, { status: 415 });
    }
    if (file.size === 0 || file.size > PHOTO_MAX_BYTES) {
      console.error(`${route}_failed bad_size`, user.id, file.size);
      return NextResponse.json({ error: "too_large" }, { status: 413 });
    }
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    const result = await saveLabReport(supabase, { data, mediaType: file.type as PhotoType }, anthropicLabReader());
    if (!result.ok) {
      console.error(`${route}_failed ${result.error}`, user.id, result.detail ?? "");
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, ...result.data });
  } catch (e) {
    if (e instanceof IdentifyError) {
      console.error(`${route}_failed model_${e.reason}`, e.message);
      return NextResponse.json({ error: "read_failed" }, { status: 502 });
    }
    console.error(`${route}_failed exception`, e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
