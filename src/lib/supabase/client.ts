"use client";
import { createBrowserClient } from "@supabase/ssr";

// Browser client. NEXT_PUBLIC_* values are inlined at build time, so they are read
// directly here; call this only inside event handlers or effects, never at render.
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
