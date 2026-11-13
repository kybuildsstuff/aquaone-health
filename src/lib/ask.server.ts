import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { findMember } from "@/lib/members.server";
import { membershipAllows } from "@/lib/membership";
import { getContext, kidneyWatchStatus, type Ctx } from "@/lib/app-data.server";
import { addDays, localDate, safeTimezone } from "@/lib/dates";
import { words } from "@/lib/cat";
import { CONDITIONS } from "@/lib/onboarding";
import type { KwStatus } from "@/lib/kidney-watch";
import {
  DAILY_QUESTION_CAP,
  MAX_QUESTION_CHARS,
  detectRedFlags,
  guardAnswer,
  takeUrgentMarker,
  urgentCopy,
  primaryFlag,
  type FlagId,
} from "@/lib/ask";
import { AskModelError, type AskModel, type AskTurn } from "@/lib/ask-model.server";

// POST /api/ask, end to end. Order matters and is the safety design (decision 5):
//   signed in -> member -> valid -> her cat -> red-flag rules on her message ->
//   daily cap (a red flag is answered even at the cap, without the model) -> save her
//   message -> stream the urgent card at once if a rule fired -> the model -> the
//   after-model guard -> save and send the answer.
// The response is NDJSON, one event per line:
//   {"type":"urgent","flags":[...]}                         (only when a rule fired, sent first)
//   {"type":"answer","id","text","urgent","flags","remaining"}
//   {"type":"error","error":"model_failed"}                  (the urgent card, if sent, stands)

export const askSchema = z.object({ message: z.string().trim().min(1) });

export type AskEvent =
  | { type: "urgent"; flags: FlagId[] }
  | { type: "answer"; id: string; text: string; urgent: boolean; flags: FlagId[]; remaining: number; replaced: string | null }
  | { type: "error"; error: string };

const json = (status: number, error: string, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status });

export async function handleAsk(request: Request, model: AskModel): Promise<Response> {
  let supabase: SupabaseClient;
  let userId = "";
  let ctx: Ctx;
  let message: string;
  try {
    supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user?.email) {
      console.error("ask_failed signed_out");
      return json(401, "signed_out");
    }
    userId = user.id;
    if (!membershipAllows(await findMember(user.email)).allowed) {
      console.error("ask_failed not_member", userId);
      return json(403, "not_member");
    }
    const parsed = askSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      console.error("ask_failed invalid", userId);
      return json(400, "invalid");
    }
    message = parsed.data.message;
    if (message.length > MAX_QUESTION_CHARS) {
      console.error("ask_failed too_long", userId, message.length);
      return json(400, "too_long");
    }
    const found = await getContext(supabase);
    if (!found) {
      console.error("ask_failed no_cat", userId);
      return json(409, "no_cat");
    }
    ctx = found;
  } catch (e) {
    console.error("ask_failed exception", userId, e instanceof Error ? e.message : String(e));
    return json(500, "server_error");
  }

  // Before the model: the hard-coded rules on her own words.
  const flags = detectRedFlags(message);
  try {
    const used = await questionsToday(supabase, ctx);
    if (used >= DAILY_QUESTION_CAP && flags.length === 0) {
      console.error("ask_failed daily_cap", userId, used);
      return json(429, "daily_cap", { cap: DAILY_QUESTION_CAP });
    }
    const atCap = used >= DAILY_QUESTION_CAP;
    await saveMessage(ctx.cat.id, "user", message, flags.length > 0);
    return streamAnswer({ supabase, ctx, message, flags, model, atCap, remaining: Math.max(0, DAILY_QUESTION_CAP - used - 1), userId });
  } catch (e) {
    console.error("ask_failed exception", userId, e instanceof Error ? e.message : String(e));
    if (flags.length) {
      // Saving failed, but she described an emergency: the card must still reach her.
      return ndjson([{ type: "urgent", flags }, { type: "error", error: "save_failed" }]);
    }
    return json(500, "server_error");
  }
}

function streamAnswer(a: {
  supabase: SupabaseClient;
  ctx: Ctx;
  message: string;
  flags: FlagId[];
  model: AskModel;
  atCap: boolean;
  remaining: number;
  userId: string;
}): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: AskEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      const { ctx } = a;
      try {
        if (a.flags.length) send({ type: "urgent", flags: a.flags });

        let text: string;
        let urgent = a.flags.length > 0;
        let flags = a.flags;
        let replaced: string | null = null;

        if (a.atCap) {
          // Over the cap, a red flag still gets the card and fixed words, never the model.
          text = `I'm here. Go now, and tell me what the vet says when you're back.`;
          replaced = "at_cap";
        } else {
          const kw = await kidneyWatchStatus(a.supabase, ctx.cat.id);
          const raw = await a.model({
            system: SYSTEM_PROMPT,
            context: await buildContext(a.supabase, ctx, kw, a.flags),
            messages: await historyFor(a.supabase, ctx.cat.id, a.message),
          });
          // The model's own "this can't wait" marker is a second net under the rules.
          const marked = takeUrgentMarker(raw);
          if (marked.urgent && !urgent) {
            urgent = true;
            flags = ["general"];
            send({ type: "urgent", flags });
          }
          // After the model: before she sees a word of it.
          const guarded = guardAnswer(marked.text, { redTopic: urgent || kw.status === "red", cat: ctx.cat, vetName: ctx.cat.vet_name });
          if (guarded.replaced) console.error("ask_guard replaced", guarded.replaced, a.userId);
          text = guarded.text;
          replaced = guarded.replaced;
        }

        const id = await saveMessage(ctx.cat.id, "assistant", text, urgent);
        send({ type: "answer", id, text, urgent, flags, remaining: a.remaining, replaced });
      } catch (e) {
        const reason = e instanceof AskModelError ? `model_${e.reason}` : "exception";
        console.error(`ask_failed ${reason}`, a.userId, e instanceof Error ? e.message : String(e));
        // With a red flag, the card has already been sent and stays; save a fixed reply so
        // the conversation shows it after a reload.
        if (a.flags.length) {
          await saveMessage(ctx.cat.id, "assistant", `Please go now. I'll be here when you're back.`, true).catch((err) =>
            console.error("ask_failed save_fallback", a.userId, err instanceof Error ? err.message : String(err)),
          );
        }
        send({ type: "error", error: "model_failed" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}

function ndjson(events: AskEvent[]) {
  return new Response(events.map((e) => JSON.stringify(e)).join("\n") + "\n", { headers: { "content-type": "application/x-ndjson; charset=utf-8" } });
}

// Her questions since midnight in her own timezone (the cap resets at her midnight).
export async function questionsToday(supabase: SupabaseClient, ctx: Ctx, at: Date = new Date()): Promise<number> {
  const { count, error } = await supabase
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("cat_id", ctx.cat.id)
    .eq("role", "user")
    .gte("created_at", localMidnightUtc(ctx.tz, at).toISOString());
  if (error) throw new Error(`cap count failed: ${error.message}`);
  return count ?? 0;
}

// The UTC instant of midnight starting her local day.
export function localMidnightUtc(tz: string, at: Date = new Date()): Date {
  const zone = safeTimezone(tz);
  const day = localDate(zone, at);
  const offsetAt = (d: Date) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
        .formatToParts(d)
        .map((x) => [x.type, x.value]),
    );
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - d.getTime();
  };
  let guess = Date.parse(`${day}T00:00:00Z`);
  for (let i = 0; i < 2; i++) guess = Date.parse(`${day}T00:00:00Z`) - offsetAt(new Date(guess));
  return new Date(guess);
}

// Service role, justified: members can only READ their messages (migration
// 20261114100000), so she can't delete her questions to reset the cap or write the
// assistant's side. The cat id comes from getContext, her own row-level-security read,
// which is what proves she owns the cat before this write.
async function saveMessage(catId: string, role: "user" | "assistant", content: string, flaggedUrgent: boolean): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .from("chat_messages")
    .insert({ cat_id: catId, role, content, flagged_urgent: flaggedUrgent })
    .select("id")
    .single();
  if (error) throw new Error(`chat_messages insert (${role}) failed: ${error.message}`);
  return data.id as string;
}

// The recent conversation (her own client), oldest first, ending with this question. Turns
// must alternate, so neighbours with the same role are joined.
async function historyFor(supabase: SupabaseClient, catId: string, current: string): Promise<AskTurn[]> {
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data, error } = await supabase
    .from("chat_messages")
    .select("role, content, created_at")
    .eq("cat_id", catId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(21);
  if (error) throw new Error(`history read failed: ${error.message}`);
  // The newest row is the question just saved; it is added back as `current` below.
  const rows = (data ?? []).slice(1).reverse() as { role: "user" | "assistant"; content: string }[];
  const turns: AskTurn[] = [];
  for (const r of [...rows, { role: "user" as const, content: current }]) {
    const last = turns[turns.length - 1];
    if (last && last.role === r.role) last.content += `\n\n${r.content}`;
    else turns.push({ role: r.role, content: r.content });
  }
  while (turns.length && turns[0].role !== "user") turns.shift();
  return turns;
}

const conditionLabel = (c: string) => (c.startsWith("other:") ? c.slice(6) : (CONDITIONS.find((x) => x.id === c)?.label ?? c));

// What the model knows about her cat: profile, the last 14 days and Kidney Watch.
export async function buildContext(supabase: SupabaseClient, ctx: Ctx, kw: KwStatus, flags: FlagId[]): Promise<string> {
  const { cat } = ctx;
  const since = addDays(ctx.today, -13);
  const sinceTs = new Date(Date.now() - 14 * 86400000).toISOString();
  const [checkIns, weighIns, breathing, profile] = await Promise.all([
    supabase.from("check_ins").select("date, drinking").eq("cat_id", cat.id).gte("date", since).order("date"),
    supabase.from("weigh_ins").select("date, cat_lb").eq("cat_id", cat.id).gte("date", addDays(ctx.today, -35)).order("date"),
    supabase.from("breathing_counts").select("taken_at, breaths_per_min").eq("cat_id", cat.id).gte("taken_at", sinceTs).order("taken_at"),
    supabase.from("cats").select("breed, start_weight_lb").eq("id", cat.id).maybeSingle(),
  ]);
  for (const r of [checkIns, weighIns, breathing, profile]) if (r.error) throw new Error(`context read failed: ${r.error.message}`);

  const w = words(cat.pronoun);
  const lines = [
    `About the cat (from the owner's profile; the owner is talking to you about this cat):`,
    `- Name: ${cat.name}. Pronouns: ${w.subj}/${w.obj}/${w.poss}.`,
    `- Age: ${cat.age_years != null ? `${Number(cat.age_years)} years` : "not given"}.${profile.data?.breed ? ` Breed: ${profile.data.breed}.` : ""}`,
    `- Lives: ${cat.lives ?? "not given"}. Food: ${cat.food ?? "not given"}.`,
    `- Health conditions the owner ticked: ${cat.conditions.length ? cat.conditions.map(conditionLabel).join(", ") : "none"}.`,
    `- Their vet: ${cat.vet_name?.trim() ? cat.vet_name.trim() : "none saved (say \"your vet\")"}.`,
    profile.data?.start_weight_lb ? `- Weight estimate at sign-up: ${Number(profile.data.start_weight_lb)} lb (an estimate, not a weigh-in).` : "",
    ``,
    `Today is ${ctx.today} in the owner's timezone.`,
    ``,
    `Kidney Watch (computed by the app's rules; you never change it): ${kwLine(kw)}`,
    ``,
    `Drinking check-ins, last 14 days (less / normal / more than usual): ${
      (checkIns.data ?? []).length ? (checkIns.data ?? []).map((c) => `${c.date} ${c.drinking}`).join("; ") : "none yet"
    }.`,
    `Weigh-ins (last 5 weeks, the cat's weight): ${
      (weighIns.data ?? []).length ? (weighIns.data ?? []).map((x) => `${x.date} ${Number(x.cat_lb)} lb`).join("; ") : "none yet"
    }.`,
    `Sleeping breathing counts, last 14 days: ${
      (breathing.data ?? []).length ? (breathing.data ?? []).map((b) => `${localDate(ctx.tz, new Date(b.taken_at as string))} ${b.breaths_per_min} a minute`).join("; ") : "none yet"
    }.`,
  ];
  if (flags.length) {
    const card = urgentCopy(primaryFlag(flags)!, cat);
    lines.push(
      ``,
      `IMPORTANT: the app's safety rules matched this message as an emergency (${flags.join(", ")}). The owner is already being shown a red card that says: "${card.title} ${card.body}" with buttons to find an emergency vet${flags.includes("poisoning") ? " and call animal poison control" : ""}. Your reply goes under that card. Back it up in one to three short sentences: go now, one practical thing to do on the way if useful. No reassurance, no guesses about the cause, no steps list, no follow-up questions.`,
    );
  }
  return lines.filter((l, i, all) => l !== "" || all[i - 1] !== "").join("\n");
}

function kwLine(kw: KwStatus): string {
  const reasons = kw.reasons.length ? ` Reasons: ${kw.reasons.join(", ")}.` : "";
  switch (kw.status) {
    case "learning":
      return `learning (${kw.checkins_total} of 7 check-ins so far; drinking isn't judged yet).${reasons}`;
    case "steady":
      return `steady, nothing unusual. "More" on ${kw.more_in_last_7} and "less" on ${kw.less_in_last_7} of the last 7 check-ins.`;
    case "amber":
      return `amber: worth a vet check this week, not an emergency. "More" on ${kw.more_in_last_7} and "less" on ${kw.less_in_last_7} of the last 7 check-ins.${kw.weight_change_pct != null ? ` Weight change against 4 weeks ago: ${kw.weight_change_pct}%.` : ""}${reasons}`;
    case "red":
      return `RED: go to a vet now. The latest resting breathing count was ${kw.latest_breaths} a minute (over 30).${reasons}`;
  }
}

// The system prompt: stable across every request (cached), the cat's data goes after it.
export const SYSTEM_PROMPT = `You are the assistant inside AquaOne Health, a cat-health companion app from PureStream (the makers of the AquaOne water fountain). You talk with cat owners, often worried ones, sometimes late at night. You already know their cat: the app gives you the cat's profile and the last 14 days of check-ins below. Use it, and mention it when it's relevant ("his check-ins show it too: more on 5 of the last 7").

How you write:
- Warm, calm, plain English, like a kind friend who knows cats well. Short: two to four sentences for most answers. No jargon; if a medical word is needed, explain it in a few words.
- Use the cat's name and the right pronoun. Say "your vet", or the vet's name when one is saved (never invent one).
- Never use headings, tables, or emoji. You may use **bold** for one key phrase.

What you never do (these protect the cat):
- Never diagnose. Don't say what the cat "has" or what "it is". You can say what a vet would want to check, and why.
- Never give a medicine, supplement or dose, never suggest human medicines, and never suggest changing a prescribed one. Say to ask the vet.
- Never reassure about anything that could be an emergency. If something could be urgent, say so plainly.
- Never claim that water, a fountain, food or any product removes plaque or tartar, or treats or prevents a disease.
- Never mention, recommend or compare any other brand or company (fountains, foods, litters, apps, pharmacies). Speak generically ("a wet food", "a fountain").
- Only mention the AquaOne fountain when it genuinely helps with drinking or hydration, and only briefly. Never sell.
- You don't know about local clinics, opening hours, prices or availability. Don't make any up.

When it can't wait: if what the owner describes could be an emergency (trouble peeing or straining, fast or open-mouth breathing, collapse, a seizure, eating or touching something toxic, not eating for a day or more, repeated vomiting, blood, an injury, or anything else that worries you), start your reply with a line that says exactly URGENT, then tell them plainly to go to an emergency vet now, in two or three sentences. Nothing else.

Format for other answers:
- One or two short paragraphs answering the question.
- When there are concrete next steps, add a line "What I'd do:" followed by one to three numbered steps (1. 2. 3.), each one short sentence.
- When signs to watch for matter, add one line starting "Go to a vet now, any hour, if" and the cat's pronoun, listing the two or three most important signs, e.g. "Go to a vet now, any hour, if he strains to pee with little coming out, stops eating, or keeps vomiting."
- Optionally end with one or two follow-up questions the owner might want to ask you next, each on its own line starting ">> " (e.g. ">> What does the test involve?"). Write them in the owner's voice, under 40 characters.

If the question isn't about cats or their care, say kindly that you can only help with the cat, and offer one cat question you could help with. You are not a vet; when a vet's judgment is needed, say so.`;
