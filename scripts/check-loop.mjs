// Checks the Loop API token from .env.local (read-only): lists registered webhooks and selling plan groups. Never prints the token.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
const key = process.env.LOOP_API_KEY ?? "";
console.log("Key:", key ? `set (${key.length} chars)` : "MISSING");
const base = "https://api.loopsubscriptions.com/admin/2026-04";
for (const path of ["/webhook", "/sellingPlanGroup"]) {
  const res = await fetch(base + path, { headers: { "X-Loop-Token": key } });
  const body = await res.json().catch(() => ({}));
  console.log(path, res.status, res.ok ? JSON.stringify(body).slice(0, 600) : JSON.stringify(body).slice(0, 300));
}
