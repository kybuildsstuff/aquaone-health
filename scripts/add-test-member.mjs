// Adds (or refreshes) a test member with a 30-day trial, for testing sign-in before Loop is wired.
// Usage: node scripts/add-test-member.mjs someone@example.com
// Marked as a test row via shopify_customer_id = 'TEST'. Remove with: node scripts/add-test-member.mjs --remove someone@example.com
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local", quiet: true });
const args = process.argv.slice(2);
const remove = args[0] === "--remove";
const email = (remove ? args[1] : args[0])?.trim().toLowerCase();
if (!email || !email.includes("@")) {
  console.log("Usage: node scripts/add-test-member.mjs email@example.com");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });
try {
  if (remove) {
    const r = await sql`delete from public.members where email = ${email} and shopify_customer_id = 'TEST' returning email`;
    console.log(r.length ? `Removed test member ${email}` : `No test member ${email}`);
  } else {
    const [row] = await sql`
      insert into public.members (email, shopify_customer_id, status, trial_ends_at)
      values (${email}, 'TEST', 'trial', now() + interval '30 days')
      on conflict (email) do update set status = 'trial', trial_ends_at = now() + interval '30 days'
      returning email, status, trial_ends_at`;
    console.log(`Test member ready: ${row.email} · ${row.status} until ${row.trial_ends_at.toISOString().slice(0, 10)}`);
  }
} catch (e) {
  console.log("FAILED:", e.message);
} finally {
  await sql.end();
}
