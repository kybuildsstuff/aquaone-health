import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getContext } from "@/lib/app-data.server";
import { questionsToday } from "@/lib/ask.server";
import { DAILY_QUESTION_CAP, detectRedFlags, type FlagId } from "@/lib/ask";
import AskChat, { type ChatItem } from "./AskChat";

export const metadata = { title: "Ask · AquaOne Health" };
export const dynamic = "force-dynamic";

export default async function AskPage() {
  const supabase = await supabaseServer();
  const ctx = await getContext(supabase);
  if (!ctx) redirect("/onboarding");

  const [{ data, error }, used] = await Promise.all([
    supabase.from("chat_messages").select("id, role, content, flagged_urgent, created_at").eq("cat_id", ctx.cat.id).order("created_at", { ascending: false }).limit(60),
    questionsToday(supabase, ctx),
  ]);
  if (error) throw new Error(`chat_messages read failed: ${error.message}`);

  // An urgent answer redraws the card the rules chose for the question before it
  // ("general" when the model itself said it can't wait).
  const rows = (data ?? []).reverse();
  const items: ChatItem[] = rows.map((m, i) => {
    let flags: FlagId[] = [];
    if (m.role === "assistant" && m.flagged_urgent) {
      const question = rows[i - 1]?.role === "user" ? rows[i - 1].content : "";
      flags = detectRedFlags(question);
      if (!flags.length) flags = ["general"];
    }
    return { id: m.id, role: m.role, text: m.content, at: m.created_at, flags };
  });

  return (
    <AskChat
      cat={{ name: ctx.cat.name, pronoun: ctx.cat.pronoun, vetName: ctx.cat.vet_name, vetPhone: ctx.cat.vet_phone }}
      tz={ctx.tz}
      initial={items}
      initialRemaining={Math.max(0, DAILY_QUESTION_CAP - used)}
    />
  );
}
