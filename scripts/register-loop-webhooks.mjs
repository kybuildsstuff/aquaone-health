// Subscribes the membership topics to the production webhook, once each (idempotent).
// Lists what Loop already has first and only adds the missing topics. Never prints the token.
//   node scripts/register-loop-webhooks.mjs           register missing topics
//   node scripts/register-loop-webhooks.mjs --dry-run show what would be registered
// Keep TOPICS in step with LOOP_TOPICS in src/lib/loop.ts (tests/loop.test.ts checks it).
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
export const ADDRESS = "https://app.trypurestream.com/api/loop/webhook";
export const TOPICS = [
  "subscription/created",
  "subscription/updated",
  "subscription/cancelled",
  "subscription/markedForCancellation",
  "subscription/paused",
  "subscription/resumed",
  "subscription/reactivated",
  "subscription/expired",
  "subscription/rescheduled",
  "subscription/delayed",
  "order/processed",
  "order/paymentFailed",
];

const base = "https://api.loopsubscriptions.com/admin/2026-04";
const key = process.env.LOOP_API_KEY;
const isMain = import.meta.url === `file://${process.argv[1]}`;

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { "X-Loop-Token": key, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.success === false) throw new Error(`${method} ${path} ${res.status} ${json?.message ?? ""}`);
  return json;
}

if (isMain) {
  if (!key) {
    console.log("LOOP_API_KEY missing from .env.local");
    process.exit(1);
  }
  const dry = process.argv.includes("--dry-run");
  try {
    const existing = (await call("GET", "/webhook")).data ?? [];
    const have = new Set(existing.filter((w) => w.address === ADDRESS && w.status === "ACTIVE").map((w) => w.topic));
    for (const w of existing) console.log("existing", w.id, w.status, w.topic, w.address);
    for (const topic of TOPICS) {
      if (have.has(topic)) {
        console.log("already", topic);
        continue;
      }
      if (dry) {
        console.log("would add", topic);
        continue;
      }
      const r = await call("POST", "/webhook", { topic, address: ADDRESS });
      console.log("added", r.data?.id, topic);
    }
    const after = (await call("GET", "/webhook")).data ?? [];
    const mine = after.filter((w) => w.address === ADDRESS);
    console.log(`Now ${mine.length} webhooks to ${ADDRESS}:`, mine.map((w) => `${w.id}:${w.topic}:${w.status}`).join(" "));
  } catch (e) {
    console.log("FAILED:", e.message);
    process.exitCode = 1;
  }
}
