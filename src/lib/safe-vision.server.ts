import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { PhotoType } from "@/lib/safe";

// Photo identification for Is it safe? (decisions 5 and 6): the strongest model names what is in
// the photo, and nothing else. It never says whether it's safe; the server matches the name
// against our own list. Kept behind one function type so tests inject a stub.
export const SAFE_VISION_MODEL = "claude-opus-5-5";

export const identificationSchema = z.object({
  found: z.boolean(),
  name: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  alternatives: z.array(z.string()),
  // Label Scan (Ky, 15 Nov): when the photo is an ingredient list, the model reads it; our code decides.
  kind: z.enum(["item", "label"]),
  product: z.string(),
  ingredients: z.array(z.string()),
  readable: z.enum(["full", "partial", "none"]),
});
export type Identification = z.infer<typeof identificationSchema>;
export type Identifier = (image: { data: string; mediaType: PhotoType }) => Promise<Identification>;

export class IdentifyError extends Error {
  constructor(
    public reason: "refusal" | "unparsed" | "api",
    message: string,
  ) {
    super(message);
  }
}

const SYSTEM = `You identify the single main item in a photo taken by a cat owner who wants to know if it is safe for her cat.
The item is usually a house or garden plant, a food, a household product or a medicine.
Return:
- found: false if no identifiable plant, food, product or medicine is visible.
- name: the most common everyday name (for a plant, its common name such as "Peace Lily" or "Spider Plant"; for a medicine or product, the generic active ingredient or type only, such as "minoxidil", "ibuprofen" or "bleach", read from the label if you can, without brand, strength or form like "5%" or "topical solution"; put the brand name in alternatives).
- confidence: how sure you are of that name.
- alternatives: up to 3 other names it could be (other common names, or look-alikes), most likely first.
- kind: "label" when the photo mainly shows a product's ingredient list or active-ingredients panel (food, treats, cleaners, flea products, cosmetics, medicines); otherwise "item".
- product: for a label, the product's name and type if visible (e.g. "Tuna cat treats", "Dog flea shampoo"), else "".
- ingredients: for a label, every ingredient exactly in the order printed, one per entry, as written (include active and inactive ingredients; drop percentages); for an item, [].
- readable: for a label, "full" if you could read the whole list, "partial" if some is cut off, blurry or covered, "none" if you couldn't read it; for an item, "full".
For a label, also set name to the product type and found to true.
Do not say whether it is safe or toxic. Do not add advice. If unsure, say so with a low confidence rather than guessing. Never invent an ingredient you cannot read.`;

let client: Anthropic | null = null;

export function anthropicIdentifier(): Identifier {
  return async ({ data, mediaType }) => {
    client ??= new Anthropic({ timeout: 45_000, maxRetries: 1 });
    try {
      const message = await client.beta.messages.parse({
        model: SAFE_VISION_MODEL,
        max_tokens: 4000,
        output_config: { effort: "low", format: betaZodOutputFormat(identificationSchema) },
        // A safety-classifier decline is re-run on a fallback model inside the same call.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data } },
              { type: "text", text: "What is the main item in this photo?" },
            ],
          },
        ],
      });
      if (message.stop_reason === "refusal") throw new IdentifyError("refusal", `refused (${message.stop_details?.category ?? "no category"})`);
      const parsed = message.parsed_output;
      if (!parsed) throw new IdentifyError("unparsed", `no parsed output (stop_reason ${message.stop_reason})`);
      return { ...parsed, name: parsed.name.trim(), alternatives: parsed.alternatives.map((a) => a.trim()).filter(Boolean).slice(0, 3) };
    } catch (e) {
      if (e instanceof IdentifyError) throw e;
      if (e instanceof Anthropic.APIError) throw new IdentifyError("api", `${e.status ?? "no status"} ${e.name}: ${e.message}`);
      throw new IdentifyError("api", e instanceof Error ? e.message : String(e));
    }
  };
}
