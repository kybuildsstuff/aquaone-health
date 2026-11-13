// Checks the Supabase database and API connections from .env.local without printing any secret.
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local", quiet: true });

const redact = (s) => String(s).replace(/postgres(ql)?:\/\/\S+/g, "<url>");

try {
  const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });
  const [row] = await sql`select version() as v`;
  console.log("Database: connected,", row.v.split(" ").slice(0, 2).join(" "));
  await sql.end();
} catch (e) {
  console.log("Database: FAILED -", e.code ?? "", redact(e.message));
}

const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
const pub = await fetch(`${base}/auth/v1/settings`, {
  headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
});
console.log("Supabase API (publishable key):", pub.status);

const secret = process.env.SUPABASE_SECRET_KEY;
const admin = await fetch(`${base}/auth/v1/admin/users?per_page=1`, {
  headers: { apikey: secret, Authorization: `Bearer ${secret}` },
});
console.log("Supabase admin (secret key):", admin.status);
