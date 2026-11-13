// Words about her cat, by the pronoun she picked at onboarding.
export type Pronoun = "he" | "she" | "they";

export const PRONOUN_WORDS = {
  he: { subj: "he", obj: "him", poss: "his", isAsleep: "he's fast asleep" },
  she: { subj: "she", obj: "her", poss: "her", isAsleep: "she's fast asleep" },
  they: { subj: "they", obj: "them", poss: "their", isAsleep: "they're fast asleep" },
} as const;

export const words = (p: Pronoun | null | undefined) => PRONOUN_WORDS[p ?? "they"];

export const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// The vet is optional (decision 8): "your vet" when none is saved.
export const vetLabel = (vetName: string | null | undefined) => vetName?.trim() || "your vet";

// Emergency vets open a Maps search on her phone: no clinic database, no location prompt (decision 8).
export const EMERGENCY_VET_MAPS_URL = "https://www.google.com/maps/search/?api=1&query=emergency+vet+near+me";
export const VET_MAPS_URL = "https://www.google.com/maps/search/?api=1&query=vet+near+me";

export const telHref = (phone: string | null | undefined) => {
  const digits = (phone ?? "").replace(/[^\d+]/g, "");
  return digits.length >= 3 ? `tel:${digits}` : null;
};
