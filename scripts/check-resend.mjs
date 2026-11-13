// Checks the Resend key from .env.local without sending email or printing the key.
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const key = process.env.RESEND_API_KEY ?? "";
console.log("Key:", key ? `set (${key.length} chars, starts ${key.slice(0, 3)}…)` : "MISSING");

const res = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` } });
const body = await res.json().catch(() => ({}));
if (res.ok) {
  for (const d of body.data ?? []) console.log(`Domain: ${d.name} · status ${d.status} · region ${d.region}`);
} else if (body.name === "restricted_api_key") {
  console.log("Key is valid (sending-only, so it can't list domains, as intended).");
} else {
  console.log("FAILED:", res.status, body.name ?? "", body.message ?? "");
}
