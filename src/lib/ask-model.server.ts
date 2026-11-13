import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// The model behind Ask (decision 5: the strongest model for chat). Kept behind one small
// function type so tests inject a stub and never call the real model.
export const ASK_MODEL = "claude-opus-5-5";

export type AskTurn = { role: "user" | "assistant"; content: string };
export type AskModelInput = { system: string; context: string; messages: AskTurn[] };
export type AskModel = (input: AskModelInput) => Promise<string>;

export class AskModelError extends Error {
  constructor(
    public reason: "refusal" | "empty" | "max_tokens" | "api",
    message: string,
  ) {
    super(message);
  }
}

let client: Anthropic | null = null;

export function anthropicAskModel(): AskModel {
  return async ({ system, context, messages }) => {
    client ??= new Anthropic({ timeout: 50_000, maxRetries: 1 });
    try {
      // Streamed on the server (no HTTP timeout on long thinking), collected whole: the
      // answer must pass the after-model guard before she sees any of it.
      const stream = client.beta.messages.stream({
        model: ASK_MODEL,
        max_tokens: 8000,
        output_config: { effort: "medium" },
        // A safety-classifier decline is re-run on a fallback model inside the same call.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: [
          { type: "text", text: system, cache_control: { type: "ephemeral" } },
          { type: "text", text: context },
        ],
        messages,
      });
      const message = await stream.finalMessage();
      if (message.stop_reason === "refusal") throw new AskModelError("refusal", `refused (${message.stop_details?.category ?? "no category"})`);
      const text = message.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("")
        .trim();
      if (message.stop_reason === "max_tokens" && !text) throw new AskModelError("max_tokens", "hit max_tokens with no text");
      if (!text) throw new AskModelError("empty", `no text (stop_reason ${message.stop_reason})`);
      return text;
    } catch (e) {
      if (e instanceof AskModelError) throw e;
      if (e instanceof Anthropic.APIError) throw new AskModelError("api", `${e.status ?? "no status"} ${e.name}: ${e.message}`);
      throw new AskModelError("api", e instanceof Error ? e.message : String(e));
    }
  };
}
