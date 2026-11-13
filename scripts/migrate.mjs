// Applies supabase/migrations/*.sql in name order, each once, inside a transaction.
// Applied files are recorded in public.schema_migrations. Never prints secrets.
//   node scripts/migrate.mjs           apply pending migrations
//   node scripts/migrate.mjs --status  list applied and pending
import { config } from "dotenv";
import postgres from "postgres";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

config({ path: ".env.local", quiet: true });

const dir = path.resolve("supabase/migrations");
const redact = (s) => String(s).replace(/postgres(ql)?:\/\/\S+/g, "<url>");
const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1, onnotice: () => {} });

try {
  await sql`create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const applied = new Set((await sql`select name from public.schema_migrations`).map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const pending = files.filter((f) => !applied.has(f));

  if (process.argv.includes("--status")) {
    for (const f of files) console.log(applied.has(f) ? "applied " : "PENDING ", f);
  } else if (pending.length === 0) {
    console.log("Nothing to apply.");
  } else {
    for (const f of pending) {
      const body = await readFile(path.join(dir, f), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into public.schema_migrations (name) values (${f})`;
      });
      console.log("applied", f);
    }
  }
} catch (e) {
  console.error("Migration FAILED:", e.code ?? "", redact(e.message));
  process.exitCode = 1;
} finally {
  await sql.end();
}
