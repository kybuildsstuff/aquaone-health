import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { findMember } from "@/lib/members.server";
import { membershipAllows } from "@/lib/membership";
import { isPassedAway, stepAfterReason } from "@/lib/cancel-flow";
import {
  CancelFlowError,
  loopApplyOffer,
  loopCancel,
  loopOffers,
  loopReasons,
  memberLoopIds,
  resyncAfterChange,
  storefrontToken,
} from "@/lib/cancel-flow.server";

// The in-app cancel flow (boards 22.1–23.1), on Loop's own cancel steps:
//   reasons -> (offers for the chosen reason) -> accept the offer, or cancel.
// Every call re-reads the reasons from Loop, so a reason id from the client is only used if Loop
// still lists it, and "My cat has passed away" never gets an offer, whatever the client sends.
const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reasons") }),
  z.object({ action: z.literal("choose"), reasonId: z.number().int() }),
  z.object({ action: z.literal("accept"), reasonId: z.number().int(), offerId: z.string().min(1).max(100) }),
  z.object({ action: z.literal("cancel"), reasonId: z.number().int(), comment: z.string().trim().max(1000).optional() }),
]);

export async function POST(request: Request) {
  const route = "cancel_flow";
  let userId = "";
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user?.email) return NextResponse.json({ error: "signed_out" }, { status: 401 });
    userId = user.id;
    const member = await findMember(user.email);
    // Only a member in a free month or paying can cancel; cancelled, past-due and ended have nothing to cancel.
    if (!membershipAllows(member).allowed || (member?.status !== "trial" && member?.status !== "active")) {
      console.error(`${route}_failed not_cancellable`, userId, member?.status ?? "none");
      return NextResponse.json({ error: "not_cancellable" }, { status: 409 });
    }
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
    const input = parsed.data;

    const { subscriptionId, customerId } = await memberLoopIds(user.email);
    const token = await storefrontToken(customerId);
    const reasons = await loopReasons(token, subscriptionId);
    if (input.action === "reasons") return NextResponse.json({ ok: true, reasons });

    const reason = reasons.find((r) => r.id === input.reasonId);
    if (!reason) {
      console.error(`${route}_failed unknown_reason`, userId, input.reasonId);
      return NextResponse.json({ error: "unknown_reason" }, { status: 400 });
    }

    if (input.action === "choose") {
      const offers = isPassedAway(reason.reason) ? [] : await loopOffers(token, subscriptionId, reason.id);
      return NextResponse.json({ ok: true, step: stepAfterReason(reason, offers), offer: offers[0] ?? null });
    }

    if (input.action === "accept") {
      if (isPassedAway(reason.reason)) return NextResponse.json({ error: "no_offer" }, { status: 400 });
      const offers = await loopOffers(token, subscriptionId, reason.id);
      if (!offers.some((o) => o.id === input.offerId)) {
        console.error(`${route}_failed unknown_offer`, userId, input.offerId);
        return NextResponse.json({ error: "no_offer" }, { status: 400 });
      }
      await loopApplyOffer(token, subscriptionId, reason.id, input.offerId);
      console.log(`${route}_offer_accepted`, userId, subscriptionId, reason.id);
      await resyncAfterChange(subscriptionId);
      return NextResponse.json({ ok: true, step: "kept" });
    }

    await loopCancel(token, subscriptionId, reason.id, input.comment);
    console.log(`${route}_cancelled`, userId, subscriptionId, reason.id);
    await resyncAfterChange(subscriptionId);
    return NextResponse.json({ ok: true, step: "cancelled" });
  } catch (e) {
    if (e instanceof CancelFlowError) {
      console.error(`${route}_failed ${e.code}`, userId, e.message);
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    console.error(`${route}_failed exception`, userId, e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
