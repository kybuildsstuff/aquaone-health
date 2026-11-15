import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CAT_COOKIE, CAT_HEADER, pickCat } from "@/lib/cats";

// The cat id remembered in her browser, or null outside a request (tests, jobs).
export async function rememberedCatId(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    return (await cookies()).get(CAT_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

// The cat a save was made from (the x-cat-id header), or null for page loads and outside a request.
export async function shownCatId(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers");
    return (await headers()).get(CAT_HEADER);
  } catch {
    return null;
  }
}

// Her active cats, oldest first, with the given columns. RLS limits it to her own.
export async function activeCats<T extends { id: string }>(supabase: SupabaseClient, columns: string): Promise<T[]> {
  const { data, error } = await supabase.from("cats").select(columns).is("archived_at", null).order("created_at").order("id");
  if (error) throw new Error(`cat lookup failed: ${error.message}`);
  return (data ?? []) as unknown as T[];
}

// The chosen cat with the given columns, plus all her active cats (for the switcher).
export async function chosenCat<T extends { id: string }>(supabase: SupabaseClient, columns: string): Promise<{ cat: T | null; cats: T[] }> {
  const [cats, remembered, shown] = await Promise.all([activeCats<T>(supabase, columns), rememberedCatId(), shownCatId()]);
  // A save names its cat: that cat or nothing (a removed or foreign id is refused, not redirected).
  if (shown) return { cat: cats.find((c) => c.id === shown) ?? null, cats };
  return { cat: pickCat(cats, remembered), cats };
}

export async function activeCatCount(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase.from("cats").select("id", { count: "exact", head: true }).is("archived_at", null);
  if (error) throw new Error(`cat count failed: ${error.message}`);
  return count ?? 0;
}
