import { NextResponse } from "next/server";
import { verifyLoopSignature, webhookSecrets, webhookTarget } from "@/lib/loop";
import { syncSubscription } from "@/lib/loop.server";
import { sendWelcomeIfDue } from "@/lib/email.server";

// Loop Subscriptions webhook. Every topic is treated as "this subscription changed":
// verify the signature on the raw body, skip other products' subscriptions, then re-read
// the subscription from the Loop API and write the members row from what Loop holds now.
// 2xx tells Loop it's done; 5xx makes Loop retry hourly (up to 20 times).
export async function POST(request: Request) {
  const raw = await request.text();
  const topic = request.headers.get("x-loop-webhook-topic") ?? "";
  const delivery = request.headers.get("x-loop-webhook-id") ?? "";
  const signature = request.headers.get("x-loop-webhook-signature");
  if (!signature) {
    console.error("loop_webhook_failed no_signature", topic, delivery);
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }
  const secrets = webhookSecrets(process.env.LOOP_WEBHOOK_SECRET);
  if (secrets.length === 0) {
    // Misconfigured: answer 5xx so Loop keeps retrying until the secret is set.
    console.error("loop_webhook_failed secret_missing", topic, delivery);
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }
  if (!verifyLoopSignature(raw, signature, secrets)) {
    console.error("loop_webhook_failed bad_signature", topic, delivery);
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    console.error("loop_webhook_failed invalid_json", topic, delivery);
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const target = webhookTarget(topic, body);
  if (target.kind === "none") {
    console.error("loop_webhook_ignored no_subscription", topic, delivery);
    return NextResponse.json({ ok: true, ignored: "no_subscription" });
  }
  // The payload shows the lines and none is ours: another product's subscription.
  // (A contract that used to be ours is caught by the nightly reconcile.)
  if (target.linesSeen && !target.ours) return NextResponse.json({ ok: true, ignored: "not_aquaone" });

  try {
    const result = await syncSubscription(target.subscriptionId);
    if (!result.ok) {
      console.error("loop_webhook_failed", result.reason, topic, target.subscriptionId, delivery);
      return NextResponse.json({ error: result.reason }, { status: result.retry ? 503 : 422 });
    }
    console.log("loop_webhook", topic, target.subscriptionId, result.outcome, result.member?.status ?? "");
    // Welcome email, once per member, the first time she can use the app (never throws).
    if (result.member) await sendWelcomeIfDue(result.member.email);
    return NextResponse.json({ ok: true, outcome: result.outcome });
  } catch (e) {
    console.error("loop_webhook_failed exception", topic, target.subscriptionId, delivery, (e as Error).message);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
