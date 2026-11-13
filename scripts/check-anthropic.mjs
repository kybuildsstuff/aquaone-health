// Checks the Anthropic API key from .env.local with one tiny call. Never prints the key.
import { config } from "dotenv";
import Anthropic from "@anthropic-ai/sdk";

config({ path: ".env.local", quiet: true });

const key = process.env.ANTHROPIC_API_KEY ?? "";
console.log("Key:", key ? `set (${key.length} chars, starts ${key.slice(0, 7)}…)` : "MISSING");

try {
  const client = new Anthropic({ apiKey: key });
  const msg = await client.messages.create({
    model: "claude-haiku-5-5",
    max_tokens: 20,
    messages: [{ role: "user", content: "Reply with exactly: AquaOne Health online" }],
  });
  console.log("Claude replied:", msg.content.map((b) => (b.type === "text" ? b.text : "")).join(""));
} catch (e) {
  console.log("FAILED:", e.status ?? "", e.error?.error?.type ?? "", e.error?.error?.message ?? e.message);
}
