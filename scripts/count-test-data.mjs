// Counts leftover test users/cats (emails ending @test.invalid). Should be 0.
import { config } from "dotenv";
import postgres from "postgres";
config({ path: ".env.local", quiet: true });
const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });
const [u] = await sql`select count(*)::int n from auth.users where email like '%@test.invalid'`;
const [c] = await sql`select count(*)::int n from public.cats`;
console.log("test users left:", u.n, "| cats in database:", c.n);
await sql.end();
