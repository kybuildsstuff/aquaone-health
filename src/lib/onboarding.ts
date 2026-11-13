import { z } from "zod";

export const CONDITIONS = [
  { id: "sensitive_stomach", label: "Sensitive stomach" },
  { id: "kidney", label: "Kidney issues" },
  { id: "urinary", label: "Urinary issues" },
  { id: "diabetes", label: "Diabetes" },
  { id: "thyroid", label: "Thyroid" },
  { id: "stiff_joints", label: "Stiff joints" },
  { id: "dental", label: "Dental" },
  { id: "overweight", label: "Overweight" },
  { id: "anxiety", label: "Anxiety" },
] as const;

const conditionIds = CONDITIONS.map((c) => c.id) as [string, ...string[]];

export const LB_PER_KG = 2.20462;

export const onboardingSchema = z.object({
  name: z.string().trim().min(1, "Add your cat's name").max(60),
  pronoun: z.enum(["he", "she", "they"]),
  ageYears: z.number().min(0).max(30),
  weight: z.number().positive().max(60).nullable(),
  weightUnit: z.enum(["lb", "kg"]),
  lives: z.enum(["indoor", "outdoor", "both"]),
  conditions: z.array(z.enum(conditionIds)).max(conditionIds.length),
  otherCondition: z.string().trim().max(80).optional().default(""),
  food: z.enum(["dry", "wet", "mix"]),
  vetName: z.string().trim().max(80).optional().default(""),
  vetPhone: z.string().trim().max(30).optional().default(""),
  remindByEmail: z.boolean(),
  checkinTime: z.enum(["08:00", "12:00", "19:00"]),
  timezone: z.string().trim().min(1).max(64),
});

export type OnboardingInput = z.input<typeof onboardingSchema>;
export type Onboarding = z.output<typeof onboardingSchema>;

// Weight is stored in pounds; returns null when she skipped it.
export function weightInLb(o: Pick<Onboarding, "weight" | "weightUnit">): number | null {
  if (o.weight == null) return null;
  const lb = o.weightUnit === "kg" ? o.weight * LB_PER_KG : o.weight;
  return Math.round(lb * 100) / 100;
}

export function catRow(o: Onboarding, ownerId: string) {
  const conditions = [...o.conditions, ...(o.otherCondition ? [`other:${o.otherCondition}`] : [])];
  return {
    owner_id: ownerId,
    name: o.name,
    pronoun: o.pronoun,
    age_years: o.ageYears,
    start_weight_lb: weightInLb(o),
    lives: o.lives,
    food: o.food,
    conditions,
    vet_name: o.vetName || null,
    vet_phone: o.vetPhone || null,
  };
}

// What she sees when saving fails, by the server's answer. Only a real network failure blames the connection.
export function saveErrorMessage(status: number | null, error?: string): string {
  if (status === null) return "We couldn't reach AquaOne Health. Check your connection and try again.";
  if (status === 401 || error === "signed_out") return "You've been signed out. Sign in again and we'll pick up where you left off.";
  if (status === 403) return "We couldn't find an active membership for this email.";
  if (status === 400) return "One of the answers didn't look right. Go back and check them, then try again.";
  return "Something went wrong on our side. Try again in a moment.";
}
