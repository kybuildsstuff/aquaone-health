// Lists every public table and whether RLS is on, plus its policy count.
import { config } from "dotenv";
import postgres from "postgres";
config({ path: ".env.local", quiet: true });
const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });
const rows = await sql`
  select c.relname as table, c.relrowsecurity as rls,
         (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' order by 1`;
for (const r of rows) console.log(r.rls ? "RLS on " : "RLS OFF", String(r.policies).padStart(2), r.table);
await sql.end();
