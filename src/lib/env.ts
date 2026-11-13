// Reads env vars at call time (never at build time), so the build needs no secrets.
export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export const supabaseUrl = () => env("NEXT_PUBLIC_SUPABASE_URL");
export const supabasePublishableKey = () => env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
