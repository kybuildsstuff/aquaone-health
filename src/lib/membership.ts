// The membership gate: who may sign in and use the app. Pure, so it is unit-tested.
export type MemberStatus = "trial" | "active" | "past_due" | "cancelled" | "ended";

export type MemberRow = {
  status: MemberStatus;
  paid_through: string | null;
  trial_ends_at: string | null;
} | null;

export type GateResult =
  | { allowed: true }
  | { allowed: false; reason: "not_found" | "ended" | "past_due" };

export function membershipAllows(member: MemberRow, now: Date = new Date()): GateResult {
  if (!member) return { allowed: false, reason: "not_found" };
  switch (member.status) {
    case "trial":
    case "active":
      return { allowed: true };
    case "past_due":
      return { allowed: false, reason: "past_due" };
    case "cancelled": {
      // Cancelled members keep access until what they already have runs out:
      // the later of the paid-through date and the free-month end.
      const ends = [member.paid_through, member.trial_ends_at]
        .filter((d): d is string => Boolean(d))
        .map((d) => new Date(d).getTime());
      const accessUntil = ends.length ? Math.max(...ends) : 0;
      return accessUntil >= now.getTime() ? { allowed: true } : { allowed: false, reason: "ended" };
    }
    default:
      return { allowed: false, reason: "ended" };
  }
}

export const normaliseEmail = (email: string) => email.trim().toLowerCase();
