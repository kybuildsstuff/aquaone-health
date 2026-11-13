import { handleAsk } from "@/lib/ask.server";
import { anthropicAskModel } from "@/lib/ask-model.server";

// Ask the assistant about her cat. Red-flag rules run before and after the model
// (decision 5); the answer comes back as NDJSON events (see handleAsk).
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleAsk(request, anthropicAskModel());
}
