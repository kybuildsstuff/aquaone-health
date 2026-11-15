import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { PhotoType } from "@/lib/safe";
import { IdentifyError, SAFE_VISION_MODEL } from "@/lib/safe-vision.server";

// Bloodwork, explained (Ky, 15 Nov, 5a): the model READS a lab report photo and nothing else. It
// never explains, judges or stages; src/lib/bloodwork.ts does that from our own list.
export const labReadingSchema = z.object({
  isLabReport: z.boolean(),
  readable: z.enum(["full", "partial", "none"]),
  labName: z.string(),
  reportDate: z.string(),
  results: z.array(
    z.object({
      name: z.string(),
      value: z.string(),
      unit: z.string(),
      refLow: z.string(),
      refHigh: z.string(),
      flag: z.enum(["high", "low", "none"]),
    }),
  ),
});
export type LabReading = z.infer<typeof labReadingSchema>;
export type LabReader = (image: { data: string; mediaType: PhotoType }) => Promise<LabReading>;

const SYSTEM = `You read a photo of a cat's veterinary lab report (blood chemistry, blood count, thyroid, or urine test) and copy out what is printed. You never interpret it.
Return:
- isLabReport: true only if the photo shows a veterinary lab report with test results.
- readable: "full" if you could read every result row, "partial" if some rows are cut off, blurry or covered, "none" if you couldn't read any.
- labName: the laboratory or clinic name if printed (e.g. "IDEXX", "Antech"), else "".
- reportDate: the date the sample was collected (else the report date), copied exactly as printed (e.g. "11/10/2026", "10 Nov 2026"); else "".
- results: one entry per test row, in printed order:
  - name: the test name exactly as printed (e.g. "CREA", "SDMA", "ALT (SGPT)").
  - value: the result exactly as printed, including "<" or ">" and words like "Negative".
  - unit: as printed, else "".
  - refLow and refHigh: the reference range ends as printed, else "".
  - flag: "high" or "low" only if the report itself marks the row (H, L, HIGH, LOW, an arrow, or a highlighted out-of-range value); otherwise "none". Do not decide this yourself from the range.
Never invent a row, a value or a range you cannot read. Never copy the owner's or the pet's name, address, phone number or account numbers. Do not explain, diagnose, stage, or give advice.`;

let client: Anthropic | null = null;

export function anthropicLabReader(): LabReader {
  return async ({ data, mediaType }) => {
    client ??= new Anthropic({ timeout: 60_000, maxRetries: 1 });
    try {
      const message = await client.beta.messages.parse({
        model: SAFE_VISION_MODEL,
        max_tokens: 8000,
        output_config: { effort: "low", format: betaZodOutputFormat(labReadingSchema) },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data } },
              { type: "text", text: "Copy out this lab report." },
            ],
          },
        ],
      });
      if (message.stop_reason === "refusal") throw new IdentifyError("refusal", `refused (${message.stop_details?.category ?? "no category"})`);
      const parsed = message.parsed_output;
      if (!parsed) throw new IdentifyError("unparsed", `no parsed output (stop_reason ${message.stop_reason})`);
      return parsed;
    } catch (e) {
      if (e instanceof IdentifyError) throw e;
      if (e instanceof Anthropic.APIError) throw new IdentifyError("api", `${e.status ?? "no status"} ${e.name}: ${e.message}`);
      throw new IdentifyError("api", e instanceof Error ? e.message : String(e));
    }
  };
}
