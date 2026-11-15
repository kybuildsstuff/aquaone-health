// Bloodwork, explained: the tables' row-level security, proved against the real database inside a
// transaction that applies the migrations and is rolled back (nothing kept, schema unchanged).
import { config } from "dotenv";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

config({ path: ".env.local", quiet: true });
const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 1, onnotice: () => {} });
afterAll(() => sql.end());
const MIGRATIONS = ["20261115160000_every_cat.sql", "20261115170000_bloodwork.sql"].map((f) => readFileSync(`supabase/migrations/${f}`, "utf8"));
const DOWN = readFileSync("supabase/down/20261115170000_bloodwork.down.sql", "utf8");
class Rollback extends Error {}

async function rolledBack(fn: (tx: postgres.TransactionSql) => Promise<void>) {
  try {
    await sql.begin(async (tx) => {
      for (const m of MIGRATIONS) await tx.unsafe(m);
      await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}
async function member(tx: postgres.TransactionSql) {
  const id = randomUUID();
  await tx`insert into auth.users (id, email, aud, role) values (${id}, ${`lab-${id}@test.invalid`}, 'authenticated', 'authenticated')`;
  const [cat] = await tx`insert into cats (owner_id, name) values (${id}, 'Milo') returning id`;
  return { id, catId: cat.id as string };
}
const actAs = (tx: postgres.TransactionSql, userId: string) =>
  tx.unsafe(`set local role authenticated; select set_config('request.jwt.claims', '${JSON.stringify({ sub: userId, role: "authenticated" })}', true);`);

describe("bloodwork tables: each member sees only her own cats' results", () => {
  it("she can add and read her panel; another member can't read it or add to her cat", async () => {
    await rolledBack(async (tx) => {
      const a = await member(tx);
      const b = await member(tx);
      await actAs(tx, a.id);
      const [p] = await tx`insert into lab_panels (cat_id, taken_on, readable) values (${a.catId}, '2026-11-10', 'full') returning id`;
      await tx`insert into lab_results (panel_id, cat_id, position, name, value, value_text) values (${p.id}, ${a.catId}, 0, 'CREA', 2.6, '2.6')`;
      expect((await tx`select count(*)::int n from lab_results`)[0].n).toBe(1);

      await tx`reset role`;
      await actAs(tx, b.id);
      expect((await tx`select count(*)::int n from lab_panels`)[0].n).toBe(0);
      expect((await tx`select count(*)::int n from lab_results`)[0].n).toBe(0);
      await tx`savepoint s`;
      await expect(tx`insert into lab_panels (cat_id, taken_on, readable) values (${a.catId}, '2026-11-10', 'full')`).rejects.toThrow(/row-level security/);
      await tx`rollback to savepoint s`;
      const del = await tx`delete from lab_panels where id = ${p.id} returning id`;
      expect(del.length).toBe(0);
    });
  });

  it("deleting a cat removes her panels and results; the undo script removes the tables", async () => {
    await rolledBack(async (tx) => {
      const a = await member(tx);
      const [p] = await tx`insert into lab_panels (cat_id, taken_on, readable) values (${a.catId}, '2026-11-10', 'full') returning id`;
      await tx`insert into lab_results (panel_id, cat_id, position, name, value_text) values (${p.id}, ${a.catId}, 0, 'CREA', '2.6')`;
      await tx`delete from cats where id = ${a.catId}`;
      expect((await tx`select count(*)::int n from lab_results where cat_id = ${a.catId}`)[0].n).toBe(0);
      await tx.unsafe(DOWN);
      expect((await tx`select to_regclass('public.lab_panels') t`)[0].t).toBeNull();
    });
  });
});
