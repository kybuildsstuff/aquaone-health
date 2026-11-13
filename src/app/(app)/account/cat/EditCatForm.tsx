"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Check, PrimaryButton, Segmented } from "@/components/ui";
import { CONDITIONS, saveErrorMessage } from "@/lib/onboarding";
import { catEditSchema } from "@/lib/account";
import { capital, words } from "@/lib/cat";
import { ScreenHeader } from "../parts";

type Form = {
  name: string;
  pronoun: "he" | "she" | "they";
  ageYears: number;
  weight: number | null;
  weightUnit: "lb" | "kg";
  lives: "indoor" | "outdoor" | "both";
  food: "dry" | "wet" | "mix";
  conditions: string[];
  vetName: string;
  vetPhone: string;
};

// Edit cat (Paper: "Edit Milo"). Saves through /api/account/cat, which writes with her own session.
export default function EditCatForm({ initial }: { initial: Form }) {
  const router = useRouter();
  const [form, setForm] = useState<Form>(initial);
  const [weightText, setWeightText] = useState(initial.weight == null ? "" : String(initial.weight));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const w = words(form.pronoun);

  async function save() {
    setError(null);
    const parsed = catEditSchema.safeParse(form);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = String(issue?.path[0] ?? "");
      setError(
        field === "name" ? "Add your cat's name." : field === "vetPhone" ? "The vet's phone number can only have digits, spaces, + ( ) and -." : field === "weight" ? "Weight should be a number, like 10.5." : "One of the answers didn't look right. Check them and try again.",
      );
      return;
    }
    setSaving(true);
    let status: number | null = null;
    let code: string | undefined;
    try {
      const res = await fetch("/api/account/cat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data) });
      status = res.status;
      code = (await res.json().catch(() => ({}))).error;
      if (res.ok) {
        router.push("/account");
        router.refresh();
        return;
      }
    } catch {
      status = null;
    }
    setSaving(false);
    setError(saveErrorMessage(status, code));
  }

  return (
    <div className="flex min-h-dvh flex-col gap-3.5 px-5 pb-12">
      <ScreenHeader
        title={`${form.name.trim() || "Your cat"}'s profile`}
        back="/account"
        action={
          <button type="button" onClick={save} disabled={saving} className="px-1 text-[17px] font-semibold text-blue disabled:opacity-50">
            {saving ? "Saving" : "Save"}
          </button>
        }
      />

      <Card className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-[13px] font-semibold text-slate">Name</span>
          <input value={form.name} maxLength={60} onChange={(e) => set("name", e.target.value)} className="bg-transparent text-[18px] font-semibold outline-none" />
        </label>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-slate">He, she or they</span>
          <Segmented
            options={[
              { value: "he", label: "He" },
              { value: "she", label: "She" },
              { value: "they", label: "They" },
            ]}
            value={form.pronoun}
            onChange={(v) => set("pronoun", v)}
          />
        </div>
      </Card>

      <Card className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-semibold text-slate">Age</span>
          <span className="text-[24px] font-semibold tracking-tight">
            {form.ageYears} <span className="text-base font-medium text-slate">{form.ageYears === 1 ? "year" : "years"}</span>
          </span>
        </div>
        <div className="flex gap-2">
          <Round label="Younger" onClick={() => set("ageYears", Math.max(0, form.ageYears - 1))}>
            −
          </Round>
          <Round label="Older" dark onClick={() => set("ageYears", Math.min(30, form.ageYears + 1))}>
            +
          </Round>
        </div>
      </Card>

      <Card className="flex items-center justify-between">
        <label className="flex flex-col gap-0.5">
          <span className="text-[13px] font-semibold text-slate">Weight, a rough estimate (optional)</span>
          <input
            inputMode="decimal"
            value={weightText}
            onChange={(e) => {
              setWeightText(e.target.value);
              const n = parseFloat(e.target.value.replace(",", "."));
              set("weight", e.target.value.trim() === "" ? null : Number.isFinite(n) && n > 0 ? n : -1);
            }}
            placeholder="10.5"
            className="w-28 bg-transparent text-[24px] font-semibold tracking-tight outline-none placeholder:text-[#C9CED9]"
          />
        </label>
        <div className="flex rounded-full bg-[#F1F0ED] p-1">
          {(["lb", "kg"] as const).map((u) => (
            <button key={u} type="button" onClick={() => set("weightUnit", u)} className={`rounded-full px-3.5 py-2 text-[14px] font-semibold ${form.weightUnit === u ? "bg-navy text-white" : "text-slate"}`}>
              {u}
            </button>
          ))}
        </div>
      </Card>

      <Card className="flex flex-col gap-2.5">
        <span className="text-[13px] font-semibold text-slate">Where does {w.subj} spend {w.poss} time?</span>
        <Segmented
          options={[
            { value: "indoor", label: "Indoors" },
            { value: "outdoor", label: "Outdoors" },
            { value: "both", label: "Both" },
          ]}
          value={form.lives}
          onChange={(v) => set("lives", v)}
        />
      </Card>

      <Card className="flex flex-col gap-2.5">
        <span className="text-[13px] font-semibold text-slate">What does {w.subj} eat?</span>
        <Segmented
          options={[
            { value: "dry", label: "Dry" },
            { value: "wet", label: "Wet" },
            { value: "mix", label: "A mix" },
          ]}
          value={form.food}
          onChange={(v) => set("food", v)}
        />
      </Card>

      <Card className="flex flex-col gap-3">
        <span className="text-[13px] font-semibold text-slate">Health</span>
        <div className="flex flex-wrap gap-2">
          {CONDITIONS.map((c) => {
            const on = form.conditions.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => set("conditions", on ? form.conditions.filter((x) => x !== c.id) : [...form.conditions, c.id])}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-2.5 text-[14px] ${on ? "bg-navy font-semibold text-white" : "border-[1.5px] border-line bg-white font-medium"}`}
              >
                {on ? <Check /> : null}
                {c.label}
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <span className="text-[13px] font-semibold text-slate">{capital(w.poss)} vet (optional)</span>
        <input value={form.vetName} maxLength={80} onChange={(e) => set("vetName", e.target.value)} placeholder="Dr. Lane · Oak Street Vets" className="rounded-xl border-[1.5px] border-line px-3.5 py-3 text-[16px] outline-none focus:border-blue" />
        <input value={form.vetPhone} maxLength={30} inputMode="tel" onChange={(e) => set("vetPhone", e.target.value)} placeholder="Phone" className="rounded-xl border-[1.5px] border-line px-3.5 py-3 text-[16px] outline-none focus:border-blue" />
      </Card>

      {error ? (
        <p role="alert" className="rounded-2xl bg-[#FDECEE] px-4 py-3 text-[15px] leading-[21px] text-[#7A1F2E]">
          {error}
        </p>
      ) : null}
      <PrimaryButton type="button" onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save changes"}
      </PrimaryButton>
      <p className="text-center text-[13px] text-[#8A93A8]">More than one cat? Coming soon.</p>
    </div>
  );
}

function Round({ label, onClick, dark, children }: { label: string; onClick: () => void; dark?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className={`flex size-11 items-center justify-center rounded-full text-[22px] font-semibold ${dark ? "bg-navy text-white" : "bg-[#F1F0ED] text-navy"}`}>
      {children}
    </button>
  );
}
