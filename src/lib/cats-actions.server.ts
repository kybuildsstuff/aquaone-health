import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResult } from "@/lib/app-data.server";
import { CAT_COOKIE } from "@/lib/cats";
import { activeCatCount, rememberedCatId } from "@/lib/cats.server";

const fail = (status: number, error: string, detail?: string) => ({ ok: false as const, status, error, detail });

async function remember(catId: string | null) {
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  if (catId) jar.set(CAT_COOKIE, catId, { path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 60 * 24 * 400 });
  else jar.delete(CAT_COOKIE);
}

// Her own cat by id (RLS: another member's id simply isn't found).
async function ownCat(supabase: SupabaseClient, catId: string) {
  const { data, error } = await supabase.from("cats").select("id, name, archived_at").eq("id", catId).maybeSingle();
  if (error) throw new Error(`cat read failed: ${error.message}`);
  return data as { id: string; name: string; archived_at: string | null } | null;
}

// Switches the app to one of her active cats.
export async function selectCat(supabase: SupabaseClient, catId: string): Promise<ActionResult<{ catId: string }>> {
  const cat = await ownCat(supabase, catId);
  if (!cat || cat.archived_at) return fail(404, "not_found");
  await remember(cat.id);
  return { ok: true, data: { catId: cat.id } };
}

// "Remove from my cats" (Ky, 15 Nov, 4a): archives her, history kept, slot freed. Her only cat
// can't be removed (every screen needs a cat).
export async function archiveCat(supabase: SupabaseClient, catId: string): Promise<ActionResult<{ catId: string }>> {
  const cat = await ownCat(supabase, catId);
  if (!cat || cat.archived_at) return fail(404, "not_found");
  if ((await activeCatCount(supabase)) <= 1) return fail(409, "last_cat");
  const { data, error } = await supabase.from("cats").update({ archived_at: new Date().toISOString() }).eq("id", cat.id).select("id");
  if (error) return fail(500, "save_failed", error.message);
  if (!data?.length) return fail(404, "not_found");
  if ((await rememberedCatId()) === cat.id) await remember(null);
  return { ok: true, data: { catId: cat.id } };
}

// Brings an archived cat back and switches to her. The database refuses a fifth active cat.
export async function restoreCat(supabase: SupabaseClient, catId: string): Promise<ActionResult<{ catId: string }>> {
  const cat = await ownCat(supabase, catId);
  if (!cat || !cat.archived_at) return fail(404, "not_found");
  const { data, error } = await supabase.from("cats").update({ archived_at: null }).eq("id", cat.id).select("id");
  if (error) return error.message.includes("cat_limit") ? fail(409, "cat_limit") : fail(500, "save_failed", error.message);
  if (!data?.length) return fail(404, "not_found");
  await remember(cat.id);
  return { ok: true, data: { catId: cat.id } };
}

// Her archived cats, newest removal first, for Account.
export async function archivedCats(supabase: SupabaseClient): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.from("cats").select("id, name").not("archived_at", "is", null).order("archived_at", { ascending: false });
  if (error) throw new Error(`archived cats read failed: ${error.message}`);
  return (data ?? []) as { id: string; name: string }[];
}

export { remember as rememberCat };
