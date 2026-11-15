// Every cat in the house: the migration's database guard, proved against the real database inside
// a transaction that applies the migration and is then rolled back (nothing is left behind, and the
// schema is unchanged until the go).
import { config } from "dotenv";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

config({ path: ".env.local", quiet: true });
const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 1, onnotice: () => {} });
afterAll(() => sql.end());
const MIGRATION = readFileSync("supabase/migrations/20261115160000_every_cat.sql", "utf8");
const DOWN = readFileSync("supabase/down/20261115160000_every_cat.down.sql", "utf8");
class Rollback extends Error {}

async function inMigrated(fn: (tx: postgres.TransactionSql, owner: string) => Promise<void>) {
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(MIGRATION);
      const owner = randomUUID();
      await tx`insert into auth.users (id, email, aud, role) values (${owner}, ${`cats-${owner}@test.invalid`}, 'authenticated', 'authenticated')`;
      await fn(tx, owner);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}
const addCat = (tx: postgres.TransactionSql, owner: string, name: string) => tx`insert into cats (owner_id, name) values (${owner}, ${name}) returning id`.then((r) => r[0].id as string);

describe("every cat: database guard", () => {
  it("allows four active cats and refuses a fifth", async () => {
    await inMigrated(async (tx, owner) => {
      for (const n of ["A", "B", "C", "D"]) await addCat(tx, owner, n);
      await tx`savepoint s`;
      await expect(addCat(tx, owner, "E")).rejects.toThrow(/cat_limit/);
      await tx`rollback to savepoint s`;
      expect((await tx`select count(*)::int n from cats where owner_id = ${owner}`)[0].n).toBe(4);
    });
  });

  it("an archived cat frees a slot; bringing her back over the limit is refused", async () => {
    await inMigrated(async (tx, owner) => {
      const ids = [];
      for (const n of ["A", "B", "C", "D"]) ids.push(await addCat(tx, owner, n));
      await tx`update cats set archived_at = now() where id = ${ids[0]}`;
      const e = await addCat(tx, owner, "E"); // the freed slot
      expect(e).toBeTruthy();
      await tx`savepoint s`;
      await expect(tx`update cats set archived_at = null where id = ${ids[0]}`).rejects.toThrow(/cat_limit/);
      await tx`rollback to savepoint s`;
      await tx`update cats set archived_at = now() where id = ${e}`;
      await tx`update cats set archived_at = null where id = ${ids[0]}`; // room again
      expect((await tx`select count(*)::int n from cats where owner_id = ${owner} and archived_at is null`)[0].n).toBe(4);
    });
  });

  it("other edits to a cat at the limit are never blocked, and another member's cats don't count", async () => {
    await inMigrated(async (tx, owner) => {
      const ids = [];
      for (const n of ["A", "B", "C", "D"]) ids.push(await addCat(tx, owner, n));
      await tx`update cats set name = 'Renamed' where id = ${ids[1]}`;
      const other = randomUUID();
      await tx`insert into auth.users (id, email, aud, role) values (${other}, ${`cats-${other}@test.invalid`}, 'authenticated', 'authenticated')`;
      expect(await addCat(tx, other, "Theirs")).toBeTruthy();
    });
  });

  it("the undo script removes everything the migration added", async () => {
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(MIGRATION);
        await tx.unsafe(DOWN);
        const col = await tx`select 1 from information_schema.columns where table_name = 'cats' and column_name = 'archived_at'`;
        const trg = await tx`select 1 from pg_trigger where tgname = 'cats_limit'`;
        expect([col.length, trg.length]).toEqual([0, 0]);
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
  });
});
