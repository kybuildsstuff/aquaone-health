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
  PHOTO_DAILY_CAP,
  PHOTO_DEFAULT_QUESTION,
  takePhotoNote,
  detectRedFlags,
  guardAnswer,
  takeUrgentMarker,
  urgentCopy,
  primaryFlag,
  type FlagId,
} from "@/lib/ask";
import { AskModelError, type AskImage, type AskModel, type AskTurn } from "@/lib/ask-model.server";
import { PHOTO_MAX_BYTES, PHOTO_TYPES, type PhotoType } from "@/lib/safe";

export const ASK_PHOTO_BUCKET = "ask-photos";

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

// A question arrives as JSON ({message}) or, with a photo, as multipart (fields "message" and
// "photo"). A photo with no words gets the default question.
type Incoming = { ok: true; message: string; photo: AskImage | null } | { ok: false; status: number; error: string };
async function readAsk(request: Request): Promise<Incoming> {
  if (!(request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const parsed = askSchema.safeParse(await request.json().catch(() => null));
    return parsed.success ? { ok: true, message: parsed.data.message, photo: null } : { ok: false, status: 400, error: "invalid" };
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("photo");
  const text = String(form?.get("message") ?? "").trim();
  if (!(file instanceof Blob)) return text ? { ok: true, message: text, photo: null } : { ok: false, status: 400, error: "invalid" };
  if (!PHOTO_TYPES.includes(file.type as PhotoType)) return { ok: false, status: 415, error: "bad_type" };
  if (file.size === 0 || file.size > PHOTO_MAX_BYTES) return { ok: false, status: 413, error: "too_large" };
  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  return { ok: true, message: text || PHOTO_DEFAULT_QUESTION, photo: { data, mediaType: file.type as PhotoType } };
}

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
  let photo: AskImage | null = null;
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
    const incoming = await readAsk(request);
    if (!incoming.ok) {
      console.error(`ask_failed ${incoming.error}`, userId);
      return json(incoming.status, incoming.error);
    }
    message = incoming.message;
    photo = incoming.photo;
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
    if (photo && flags.length === 0 && (await photosToday(supabase, ctx)) >= PHOTO_DAILY_CAP) {
      console.error("ask_failed photo_cap", userId);
      return json(429, "photo_cap", { cap: PHOTO_DAILY_CAP });
    }
    const atCap = used >= DAILY_QUESTION_CAP;
    const photoPath = photo ? await storePhoto(ctx.cat.id, photo) : null;
    const questionId = await saveMessage(ctx.cat.id, "user", message, flags.length > 0, photoPath);
    return streamAnswer({ supabase, ctx, message, flags, model, atCap, remaining: Math.max(0, DAILY_QUESTION_CAP - used - 1), userId, photo, questionId });
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
  photo: AskImage | null;
  questionId: string;
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
            ...(a.photo ? { image: a.photo } : {}),
          });
          // With a photo, the model's one-line description is kept on her question (it may come
          // before or after the URGENT line), so later questions can refer back to it.
          const first = takePhotoNote(raw);
          const marked0 = takeUrgentMarker(first.text);
          const second = takePhotoNote(marked0.text);
          const marked = { urgent: marked0.urgent, text: second.text };
          const note = first.note ?? second.note;
          if (a.photo && note) await saveNote(a.questionId, note);
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

// Her questions since midnight in her own timezone (the cap resets at her midnight). The cap is
// per member across all her cats (Ky, 15 Nov, 2a): no cat filter, and her own session's RLS
// limits the count to her cats, archived ones included.
export async function questionsToday(supabase: SupabaseClient, ctx: Ctx, at: Date = new Date()): Promise<number> {
  const { count, error } = await supabase
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
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

// Her photo questions since her midnight (10 a day, inside the 30-question cap).
export async function photosToday(supabase: SupabaseClient, ctx: Ctx, at: Date = new Date()): Promise<number> {
  const { count, error } = await supabase
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("role", "user") // per member across her cats, like questionsToday
    .not("photo_path", "is", null)
    .gte("created_at", localMidnightUtc(ctx.tz, at).toISOString());
  if (error) throw new Error(`photo cap count failed: ${error.message}`);
  return count ?? 0;
}

// The photo goes to the private bucket under her cat's id (service role; the bucket has no
// member policies). Kept 90 days, then deleted by the daily cleanup job.
async function storePhoto(catId: string, photo: AskImage): Promise<string> {
  const ext = photo.mediaType.split("/")[1].replace("jpeg", "jpg");
  const path = `${catId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabaseAdmin().storage.from(ASK_PHOTO_BUCKET).upload(path, Buffer.from(photo.data, "base64"), { contentType: photo.mediaType });
  if (error) throw new Error(`photo upload failed: ${error.message}`);
  return path;
}

async function saveNote(questionId: string, note: string) {
  const { error } = await supabaseAdmin().from("chat_messages").update({ photo_note: note }).eq("id", questionId);
  if (error) console.error("ask_photo_note_failed", error.message);
}

// Short-lived links for the photos in her conversation (the bucket is private).
export async function signPhotos(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!paths.length) return out;
  const { data, error } = await supabaseAdmin().storage.from(ASK_PHOTO_BUCKET).createSignedUrls(paths, 3600);
  if (error) {
    console.error("ask_photo_sign_failed", error.message);
    return out;
  }
  for (const d of data ?? []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
  return out;
}

// Service role, justified: members can only READ their messages (migration
// 20261114100000), so she can't delete her questions to reset the cap or write the
// assistant's side. The cat id comes from getContext, her own row-level-security read,
// which is what proves she owns the cat before this write.
async function saveMessage(catId: string, role: "user" | "assistant", content: string, flaggedUrgent: boolean, photoPath: string | null = null): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .from("chat_messages")
    .insert({ cat_id: catId, role, content, flagged_urgent: flaggedUrgent, ...(photoPath ? { photo_path: photoPath } : {}) })
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
    .select("role, content, photo_note, created_at")
    .eq("cat_id", catId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(21);
  if (error) throw new Error(`history read failed: ${error.message}`);
  // The newest row is the question just saved; it is added back as `current` below.
  const rows = ((data ?? []).slice(1).reverse() as { role: "user" | "assistant"; content: string; photo_note: string | null }[]).map((r) => ({
    role: r.role,
    content: r.photo_note ? `[She sent a photo: ${r.photo_note}]\n${r.content}` : r.content,
  }));
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
      return kw.lapsed
        ? `paused: only ${kw.recent_checkins} check-ins in the last 14 days, so drinking isn't judged until there are 7 recent ones.${reasons}`
        : `learning (${kw.recent_checkins} of 7 check-ins so far; drinking isn't judged yet).${reasons}`;
    case "steady":
      return `steady on drinking: "more" on ${kw.more_in_last_7} and "less" on ${kw.less_in_last_7} of the last 7 check-ins.${kw.weight_change_pct != null ? ` Weight change against 4 weeks ago: ${kw.weight_change_pct}%.` : " No recent weigh-in pair, so weight is not judged."}${kw.latest_breaths != null ? ` Latest breathing count this week: ${kw.latest_breaths} a minute.` : " No breathing count this week, so breathing is not judged."}`;
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

Photos: she may send a photo with her question (vomit, stool, urine, a wound, an eye, skin, gums, a plant or food the cat got into, the cat itself). When there is a photo:
- Start your reply with one line "PHOTO: " and a plain, neutral description of what the photo shows, under 15 words (e.g. "PHOTO: small pile of vomit with hair and undigested food"). If there is also an URGENT line, the URGENT line comes first and the PHOTO line second.
- Then answer as usual, saying what you can see that matters, and what to watch for or do next. Describe; never name a disease or condition from a photo.
- If the photo shows anything that could be an emergency (blood, a cat straining in the litter box, pale, white or blue gums, open-mouth breathing, a swollen belly, a wound, a lily or another toxic item she may have eaten), it is URGENT.
- If you can't tell what the photo shows, say so and ask for a clearer photo or a few words.

If the question isn't about cats or their care, say kindly that you can only help with the cat, and offer one cat question you could help with. You are not a vet; when a vet's judgment is needed, say so.`;

export const ASK_PHOTO_KEEP_DAYS = 90;

// Deletes Ask photos older than 90 days from storage and clears photo_path on their messages
// (the question text and photo_note stay). Service role: a background job, no member involved.
export async function deleteOldAskPhotos(now: Date = new Date()): Promise<{ deleted: number }> {
  const cutoff = new Date(now.getTime() - ASK_PHOTO_KEEP_DAYS * 86400000).toISOString();
  let deleted = 0;
  for (;;) {
    const { data, error } = await supabaseAdmin().from("chat_messages").select("id, photo_path").not("photo_path", "is", null).lt("created_at", cutoff).limit(100);
    if (error) throw new Error(`old photo read failed: ${error.message}`);
    if (!data?.length) break;
    const removed = await supabaseAdmin().storage.from(ASK_PHOTO_BUCKET).remove(data.map((r) => r.photo_path as string));
    if (removed.error) throw new Error(`photo delete failed: ${removed.error.message}`);
    const cleared = await supabaseAdmin().from("chat_messages").update({ photo_path: null }).in("id", data.map((r) => r.id));
    if (cleared.error) throw new Error(`photo_path clear failed: ${cleared.error.message}`);
    deleted += data.length;
  }
  // Files no message points to (a deleted cat, a message that failed to save), a day old or more.
  for (;;) {
    const { data, error } = await supabaseAdmin().rpc("ask_photo_orphans", { p_before: new Date(now.getTime() - 86400000).toISOString(), p_limit: 500 });
    if (error) throw new Error(`orphan photo read failed: ${error.message}`);
    const names = ((data ?? []) as { name: string }[]).map((r) => r.name);
    if (!names.length) return { deleted };
    const removed = await supabaseAdmin().storage.from(ASK_PHOTO_BUCKET).remove(names);
    if (removed.error) throw new Error(`orphan photo delete failed: ${removed.error.message}`);
    deleted += names.length;
  }
}
