import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env, supabaseUrl } from "@/lib/env";

// Service-role client: bypasses row-level security. Server only, never sent to a browser.
export function supabaseAdmin() {
  return createClient(supabaseUrl(), env("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
