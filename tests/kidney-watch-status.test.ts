// Proves kidney_watch_status() against the real database. Every scenario runs
// inside a transaction that is rolled back, so nothing is left behind.
import { config } from "dotenv";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

config({ path: ".env.local", quiet: true });
const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 1, onnotice: () => {} });
afterAll(() => sql.end());

const TODAY = new Date("2026-12-10T12:00:00Z");
const day = (offset: number) => new Date(TODAY.getTime() + offset * 86400000).toISOString().slice(0, 10);

type Drink = "less" | "normal" | "more";
type Scenario = {
  checkins?: Drink[]; // oldest first, one per day ending today
  weighins?: { daysAgo: number; catLb: number }[];
  breaths?: { daysAgo: number; bpm: number }[]; // latest = smallest daysAgo
};
type Status = { status: string; reasons: string[]; checkins_total: number; more_in_last_7: number; less_in_last_7: number; weight_change_pct: string | null; latest_breaths: number | null };

class Rollback extends Error {}

async function statusFor(s: Scenario): Promise<Status> {
  let result: Status | undefined;
  try {
    await sql.begin(async (tx) => {
      const userId = randomUUID();
      await tx`insert into auth.users (id, email, aud, role) values (${userId}, ${`kw-${userId}@test.invalid`}, 'authenticated', 'authenticated')`;
      const [cat] = await tx`insert into cats (owner_id, name) values (${userId}, 'Test') returning id`;
      const checkins = s.checkins ?? [];
      for (let i = 0; i < checkins.length; i++) {
        await tx`insert into check_ins (cat_id, date, drinking) values (${cat.id}, ${day(i - (checkins.length - 1))}, ${checkins[i]})`;
      }
      for (const w of s.weighins ?? []) {
        await tx`insert into weigh_ins (cat_id, date, owner_lb, with_cat_lb) values (${cat.id}, ${day(-w.daysAgo)}, 140, ${140 + w.catLb})`;
      }
      for (const b of s.breaths ?? []) {
        await tx`insert into breathing_counts (cat_id, taken_at, breaths_per_min) values (${cat.id}, ${new Date(TODAY.getTime() - b.daysAgo * 86400000)}, ${b.bpm})`;
      }
      const [row] = await tx`select * from kidney_watch_status(${cat.id})`;
      result = row as unknown as Status;
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  return result!;
}

const normals = (n: number): Drink[] => Array(n).fill("normal");

describe("kidney_watch_status", () => {
  it("learning: fewer than 7 check-ins, nothing else wrong", async () => {
    const r = await statusFor({ checkins: ["more", "more", "more", "more", "more", "more"] });
    expect(r.status).toBe("learning");
    expect(r.reasons).toEqual([]);
    expect(r.checkins_total).toBe(6);
  });

  it("steady: 10 normal check-ins, stable weight, normal breathing", async () => {
    const r = await statusFor({
      checkins: normals(10),
      weighins: [{ daysAgo: 28, catLb: 10.6 }, { daysAgo: 0, catLb: 10.5 }],
      breaths: [{ daysAgo: 1, bpm: 22 }],
    });
    expect(r.status).toBe("steady");
    expect(r.reasons).toEqual([]);
  });

  it("amber-more: 4 of the last 7 check-ins are 'more'", async () => {
    const r = await statusFor({ checkins: [...normals(5), "more", "normal", "more", "normal", "more", "more"] });
    expect(r.status).toBe("amber");
    expect(r.reasons).toEqual(["drinking_more"]);
    expect(r.more_in_last_7).toBe(4);
  });

  it("threshold: 3 of the last 7 'more' stays steady", async () => {
    const r = await statusFor({ checkins: [...normals(5), "more", "normal", "more", "normal", "normal", "more"] });
    expect(r.status).toBe("steady");
    expect(r.more_in_last_7).toBe(3);
  });

  it("only the last 7 count: old 'more' days don't trigger", async () => {
    const r = await statusFor({ checkins: ["more", "more", "more", "more", ...normals(7)] });
    expect(r.status).toBe("steady");
  });

  it("amber-less: 4 of the last 7 check-ins are 'less'", async () => {
    const r = await statusFor({ checkins: [...normals(3), "less", "less", "normal", "less", "less"] });
    expect(r.status).toBe("amber");
    expect(r.reasons).toEqual(["drinking_less"]);
  });

  it("amber-weight: 5%+ down against the weigh-in 4 weeks earlier", async () => {
    const r = await statusFor({
      checkins: normals(10),
      weighins: [{ daysAgo: 28, catLb: 10.6 }, { daysAgo: 14, catLb: 10.3 }, { daysAgo: 0, catLb: 10.0 }],
    });
    expect(r.status).toBe("amber");
    expect(r.reasons).toEqual(["weight_down_5pct"]);
    expect(Number(r.weight_change_pct)).toBeCloseTo(-5.7, 1);
  });

  it("threshold: 4.7% down stays steady", async () => {
    const r = await statusFor({ checkins: normals(10), weighins: [{ daysAgo: 28, catLb: 10.6 }, { daysAgo: 0, catLb: 10.1 }] });
    expect(r.status).toBe("steady");
  });

  it("weight with no reference 21–35 days earlier is not judged", async () => {
    const r = await statusFor({ checkins: normals(10), weighins: [{ daysAgo: 7, catLb: 11.0 }, { daysAgo: 0, catLb: 9.5 }] });
    expect(r.status).toBe("steady");
    expect(r.weight_change_pct).toBeNull();
  });

  it("weight drop counts even while still learning", async () => {
    const r = await statusFor({ checkins: normals(3), weighins: [{ daysAgo: 28, catLb: 10.6 }, { daysAgo: 0, catLb: 9.9 }] });
    expect(r.status).toBe("amber");
  });

  it("red-breathing: latest count over 30 beats amber", async () => {
    const r = await statusFor({
      checkins: [...normals(3), "more", "more", "more", "more"],
      breaths: [{ daysAgo: 5, bpm: 22 }, { daysAgo: 0, bpm: 34 }],
    });
    expect(r.status).toBe("red");
    expect(r.reasons).toEqual(["drinking_more", "breathing_over_30"]);
  });

  it("red-breathing applies during learning too", async () => {
    const r = await statusFor({ checkins: normals(2), breaths: [{ daysAgo: 0, bpm: 40 }] });
    expect(r.status).toBe("red");
  });

  it("threshold: exactly 30 is not red; a newer normal count clears an old high one", async () => {
    expect((await statusFor({ checkins: normals(8), breaths: [{ daysAgo: 0, bpm: 30 }] })).status).toBe("steady");
    expect((await statusFor({ checkins: normals(8), breaths: [{ daysAgo: 3, bpm: 36 }, { daysAgo: 0, bpm: 24 }] })).status).toBe("steady");
  });
});
