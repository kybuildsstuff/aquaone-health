// Kidney Watch: what the status from kidney_watch_status() means, which alerts it
// opens or resolves, and the words she sees. Pure, so it is unit-tested; the rules
// themselves live in the SQL function (decision 7) and are tested against the database.
import { z } from "zod";

export type KwReason = "drinking_more" | "drinking_less" | "weight_down_5pct" | "breathing_over_30";
export type KwStatusName = "learning" | "steady" | "amber" | "red";

export type KwStatus = {
  status: KwStatusName;
  reasons: KwReason[];
  checkins_total: number;
  more_in_last_7: number;
  less_in_last_7: number;
  weight_change_pct: number | null;
  latest_breaths: number | null;
};

export const LEARNING_CHECKINS = 7;
export const BREATHING_RED_OVER = 30;

export const REASON_LEVEL: Record<KwReason, "amber" | "red"> = {
  drinking_more: "amber",
  drinking_less: "amber",
  weight_down_5pct: "amber",
  breathing_over_30: "red",
};

// The RPC returns numerics as strings; normalise.
export function toKwStatus(row: Record<string, unknown> | null | undefined): KwStatus {
  return {
    status: (row?.status as KwStatusName) ?? "learning",
    reasons: ((row?.reasons as string[]) ?? []).filter((r): r is KwReason => r in REASON_LEVEL),
    checkins_total: Number(row?.checkins_total ?? 0),
    more_in_last_7: Number(row?.more_in_last_7 ?? 0),
    less_in_last_7: Number(row?.less_in_last_7 ?? 0),
    weight_change_pct: row?.weight_change_pct == null ? null : Number(row.weight_change_pct),
    latest_breaths: row?.latest_breaths == null ? null : Number(row.latest_breaths),
  };
}

// One open alert per firing rule. A rule that starts firing opens an alert; a rule that
// stops firing resolves its open alert. Rules still firing keep their existing alert.
export function planAlertSync(reasons: KwReason[], open: { id: string; kind: string }[]) {
  const openKinds = new Set(open.map((a) => a.kind));
  return {
    toOpen: reasons.filter((r) => !openKinds.has(r)).map((kind) => ({ kind, level: REASON_LEVEL[kind] })),
    toResolve: open.filter((a) => !reasons.includes(a.kind as KwReason)).map((a) => a.id),
  };
}

// Input from the app ---------------------------------------------------------------

export const checkInSchema = z.object({ drinking: z.enum(["less", "normal", "more"]) });

export const LB_PER_KG = 2.20462;
const round2 = (n: number) => Math.round(n * 100) / 100;

export const weighInSchema = z.object({
  ownerWeight: z.number().positive().max(1000),
  withCatWeight: z.number().positive().max(1000),
  unit: z.enum(["lb", "kg"]),
});

export type WeighInResult =
  | { ok: true; ownerLb: number; withCatLb: number; catLb: number }
  | { ok: false; error: "not_heavier" | "cat_weight_out_of_range" };

// Two readings on her bathroom scale; the cat's weight is the difference. Stored in pounds.
export function weighInPounds(input: z.output<typeof weighInSchema>): WeighInResult {
  const k = input.unit === "kg" ? LB_PER_KG : 1;
  const ownerLb = round2(input.ownerWeight * k);
  const withCatLb = round2(input.withCatWeight * k);
  if (withCatLb <= ownerLb) return { ok: false, error: "not_heavier" };
  const catLb = round2(withCatLb - ownerLb);
  if (catLb < 0.5 || catLb > 40) return { ok: false, error: "cat_weight_out_of_range" };
  return { ok: true, ownerLb, withCatLb, catLb };
}

export const BREATHING_SECONDS = 30;
// Breaths she tapped in 30 seconds; the server doubles it to breaths a minute.
export const breathingSchema = z.object({ breaths: z.number().int().min(1).max(100) });
export const breathsPerMinute = (breathsIn30s: number) => breathsIn30s * (60 / BREATHING_SECONDS);

export const careTaskSchema = z.object({ taskId: z.string().min(1).max(64), done: z.boolean() });

// What she sees when a save fails, by the server's answer. Only a real network failure blames the connection.
export function actionErrorMessage(status: number | null, error?: string): string {
  if (status === null) return "We couldn't reach AquaOne Health. Check your connection and try again.";
  if (status === 401 || error === "signed_out") return "You've been signed out. Sign in again to save this.";
  if (status === 403) return "We couldn't find an active membership for this email.";
  if (error === "no_cat") return "Set up your cat first, then try again.";
  if (error === "not_heavier") return "The second reading should be heavier than the first. Check both readings.";
  if (error === "cat_weight_out_of_range") return "That weight doesn't look right for a cat. Check both readings.";
  if (error === "not_in_plan") return "That task isn't in today's plan any more, so we've refreshed it.";
  if (status === 400) return "That didn't look right. Check it and try again.";
  return "Something went wrong on our side. Try again in a moment.";
}
