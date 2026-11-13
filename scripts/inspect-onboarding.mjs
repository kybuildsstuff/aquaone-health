// Read-only: shows saved cats, reminder prefs and sign-in users, to debug onboarding.
import { config } from "dotenv";
import postgres from "postgres";
config({ path: ".env.local", quiet: true });
const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });
console.log(await sql`select u.email, u.created_at, u.email_confirmed_at, u.last_sign_in_at from auth.users u order by created_at`);
console.log(await sql`select name, pronoun, age_years, start_weight_lb, lives, food, conditions, vet_name is not null as has_vet, length(vet_phone) as phone_len, created_at from public.cats`);
console.log(await sql`select by_email, checkin_time, timezone from public.reminder_prefs`);
console.log(await sql`select email, status, auth_user_id is not null as linked from public.members`);
await sql.end();
