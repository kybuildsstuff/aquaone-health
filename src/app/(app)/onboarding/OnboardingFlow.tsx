"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BackButton, Card, Check, Drop, LightButton, PrimaryButton, Progress, Segmented } from "@/components/ui";
import { CONDITIONS, type OnboardingInput, saveErrorMessage } from "@/lib/onboarding";
import AddToHomeScreen, { shouldOfferAddToHomeScreen } from "@/components/AddToHomeScreen";

type Step = "welcome" | "name" | "basics" | "health" | "food" | "reminders" | "ready" | "home";
const QUESTION_STEPS: Step[] = ["name", "basics", "health", "food", "reminders"];

const PRONOUNS = {
  he: { subj: "he", obj: "him", poss: "his" },
  she: { subj: "she", obj: "her", poss: "her" },
  they: { subj: "they", obj: "them", poss: "their" },
} as const;

const LIVES_TEXT = { indoor: "indoor", outdoor: "outdoor", both: "indoor-outdoor" } as const;

export default function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [none, setNone] = useState(false);
  const [form, setForm] = useState<OnboardingInput>({
    name: "",
    pronoun: "he",
    ageYears: 8,
    weight: null,
    weightUnit: "lb",
    lives: "indoor",
    conditions: [],
    otherCondition: "",
    food: "mix",
    vetName: "",
    vetPhone: "",
    remindByEmail: true,
    checkinTime: "08:00",
    timezone: typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "America/New_York",
  });
  const set = <K extends keyof OnboardingInput>(k: K, v: OnboardingInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const name = form.name.trim() || "your cat";
  const p = PRONOUNS[form.pronoun];
  const qIndex = QUESTION_STEPS.indexOf(step);

  const next = () => setStep(QUESTION_STEPS[qIndex + 1] ?? "ready");
  const back = () => setStep(qIndex <= 0 ? "welcome" : QUESTION_STEPS[qIndex - 1]);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...form, conditions: none ? [] : form.conditions }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) return setStep("ready");
    const body = res ? await res.json().catch(() => ({})) : {};
    if (body.error === "already_onboarded") return router.replace("/today");
    setError(saveErrorMessage(res ? res.status : null, body.error));
  }

  const conditionText = useMemo(() => {
    const labels = (none ? [] : form.conditions).map((id) => CONDITIONS.find((c) => c.id === id)?.label.toLowerCase());
    if (!labels.length) return "";
    return ` with ${labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}` : labels[0]}`;
  }, [form.conditions, none]);

  if (step === "welcome") {
    return (
      <div className="flex min-h-dvh flex-col bg-navy px-7 pb-10 text-white">
        <div className="relative flex flex-1 items-center justify-center overflow-hidden">
          <div className="absolute size-[420px] rounded-full border border-[rgba(186,196,255,0.10)]" />
          <div className="absolute size-[300px] rounded-full border border-[rgba(186,196,255,0.16)]" />
          <div className="absolute size-[190px] rounded-full bg-[rgba(83,105,238,0.18)]" />
          <div className="relative flex size-28 items-center justify-center rounded-full bg-blue shadow-[0_20px_60px_rgba(83,105,238,0.55)]">
            <Drop size={44} />
          </div>
        </div>
        <div className="flex flex-col gap-7">
          <div className="flex flex-col gap-3.5">
            <p className="text-[13px] font-semibold tracking-[0.12em] text-lilac">AQUAONE HEALTH</p>
            <h1 className="text-[34px] leading-[39px] font-medium tracking-tight">Let&apos;s get to know your cat.</h1>
            <p className="text-[17px] leading-6 text-[#B9C3DA]">Two minutes, a few easy questions. Everything after is built around them.</p>
          </div>
          <LightButton onClick={() => setStep("name")}>Let&apos;s start</LightButton>
        </div>
      </div>
    );
  }

  if (step === "ready") {
    return (
      <div className="flex min-h-dvh flex-col px-7 pt-12 pb-10">
        <div className="flex flex-1 flex-col gap-6">
          <div className="flex flex-col items-center gap-4.5 pt-2">
            <div className="relative flex size-[120px] items-center justify-center rounded-full bg-lilac text-5xl font-semibold">
              {form.name.trim().charAt(0).toUpperCase() || "?"}
              <span className="absolute right-0 bottom-1 flex size-[38px] items-center justify-center rounded-full border-4 border-paper bg-blue">
                <Check size={14} />
              </span>
            </div>
            <h1 className="text-center text-[30px] leading-[35px] font-medium tracking-tight">{name}&apos;s plan is ready.</h1>
            <p className="text-center text-base leading-[23px] text-slate">
              Built for {article(form.ageYears)} {form.ageYears}-year-old {LIVES_TEXT[form.lives]} cat{conditionText}.
            </p>
          </div>
          <div className="flex flex-col gap-3.5 rounded-[22px] bg-white p-[18px] shadow-[0_10px_30px_rgba(7,29,60,0.06)]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold tracking-[0.08em] text-blue">STARTING TOMORROW</span>
              <span className="text-xs font-semibold text-slate">
                {form.checkinTime === "08:00" ? "8 am" : form.checkinTime === "12:00" ? "12 pm" : "7 pm"}
              </span>
            </div>
            {["A 10-second drinking check-in", "3 gentle care tasks a day", "Kidney Watch, learning " + p.poss + " normal"].map((t) => (
              <div key={t} className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-lilac-soft">
                  <Drop size={14} color="#5369EE" />
                </span>
                <span className="text-[15px] font-semibold">{t}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 rounded-[18px] bg-navy px-4 py-3.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-blue">
              <Drop size={13} />
            </span>
            <span className="text-[14px] leading-5 text-[#DDE2F5]">Ask me anything about {name}, any hour. I already know {p.obj}.</span>
          </div>
        </div>
        <div className="flex flex-col gap-3 pt-6">
          <PrimaryButton onClick={() => (shouldOfferAddToHomeScreen() ? setStep("home") : router.replace("/today"))}>
            Go to {name}&apos;s day
          </PrimaryButton>
          <p className="text-center text-[13px] text-[#8A93A8]">Guidance, not a vet. Urgent signs go to your vet.</p>
        </div>
      </div>
    );
  }

  if (step === "home") {
    return <AddToHomeScreen catName={name} onDone={() => router.replace("/today")} />;
  }

  const total = QUESTION_STEPS.length;
  const canContinue = step !== "name" || form.name.trim().length > 0;

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex items-center gap-4 px-5 pt-5">
        <BackButton onClick={back} />
        <Progress step={qIndex + 1} total={total} />
        <span className="w-10 shrink-0 text-right text-[13px] font-semibold text-slate">
          {qIndex + 1} of {total}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-8 px-7 pt-10">
        {step === "name" && (
          <>
            <Question title="What's your cat's name?" sub="We'll use it everywhere, so the app feels like it's about them." />
            <div className="flex flex-col gap-4">
              <label className="flex h-16 items-center justify-between rounded-[18px] border-2 border-blue bg-white px-5 shadow-[0_0_0_5px_rgba(83,105,238,0.10)]">
                <input
                  autoFocus
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  maxLength={60}
                  placeholder="Milo"
                  className="w-full bg-transparent text-[22px] font-medium outline-none placeholder:text-[#C9CED9]"
                />
                <span className="text-[13px] text-[#8A93A8]">Name</span>
              </label>
              <Segmented
                options={[
                  { value: "he", label: "He" },
                  { value: "she", label: "She" },
                  { value: "they", label: "They" },
                ]}
                value={form.pronoun}
                onChange={(v) => set("pronoun", v)}
              />
              <p className="text-[13px] text-[#8A93A8]">Photo uploads arrive in an update. Got more than one cat? Add the others later.</p>
            </div>
          </>
        )}

        {step === "basics" && (
          <>
            <Question title={`Tell us about ${name}.`} sub="Rough numbers are fine. You can change them any time." />
            <div className="flex flex-col gap-3">
              <Card className="flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-semibold text-slate">Age</span>
                  <span className="text-[26px] font-semibold tracking-tight">
                    {form.ageYears} <span className="text-base font-medium text-slate">{form.ageYears === 1 ? "year" : "years"}</span>
                  </span>
                </div>
                <div className="flex gap-2">
                  <RoundButton label="Younger" onClick={() => set("ageYears", Math.max(0, form.ageYears - 1))} sign="minus" />
                  <RoundButton label="Older" onClick={() => set("ageYears", Math.min(30, form.ageYears + 1))} sign="plus" dark />
                </div>
              </Card>
              <Card className="flex items-center justify-between">
                <label className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-semibold text-slate">Weight (optional)</span>
                  <input
                    inputMode="decimal"
                    value={form.weight ?? ""}
                    onChange={(e) => {
                      const n = parseFloat(e.target.value.replace(",", "."));
                      set("weight", Number.isFinite(n) && n > 0 ? n : null);
                    }}
                    placeholder="10.5"
                    className="w-28 bg-transparent text-[26px] font-semibold tracking-tight outline-none placeholder:text-[#C9CED9]"
                  />
                </label>
                <div className="flex rounded-full bg-[#F1F0ED] p-1">
                  {(["lb", "kg"] as const).map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => set("weightUnit", u)}
                      className={`rounded-full px-3.5 py-2 text-[14px] font-semibold ${form.weightUnit === u ? "bg-navy text-white" : "text-slate"}`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </Card>
              <Card className="flex flex-col gap-2.5">
                <span className="text-[13px] font-semibold text-slate">Where does {p.subj} spend {p.poss} time?</span>
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
            </div>
          </>
        )}

        {step === "health" && (
          <>
            <Question title={`Anything we should know about ${p.poss} health?`} sub="Pick any that apply. This shapes the plan. It's never a diagnosis." />
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2.5">
                {CONDITIONS.map((c) => {
                  const on = !none && form.conditions.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        setNone(false);
                        set("conditions", on ? form.conditions.filter((x) => x !== c.id) : [...form.conditions, c.id]);
                      }}
                      className={`flex items-center gap-2 rounded-full px-4 py-3 text-[15px] ${
                        on ? "bg-navy font-semibold text-white" : "border-[1.5px] border-line bg-white font-medium"
                      }`}
                    >
                      {on ? <Check /> : null}
                      {c.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  aria-pressed={none}
                  onClick={() => {
                    setNone(!none);
                    if (!none) set("conditions", []);
                  }}
                  className={`flex-1 rounded-[14px] border-[1.5px] border-dashed py-3.5 text-[15px] font-medium ${none ? "border-blue bg-lilac-soft text-navy" : "border-[#C9C6C0] text-slate"}`}
                >
                  None that I know of
                </button>
              </div>
              <div className="flex items-start gap-3 rounded-2xl bg-lilac-soft px-4 py-3.5">
                <svg width="18" height="20" viewBox="0 0 24 26" className="shrink-0" aria-hidden>
                  <path d="M12 2L3 6v6c0 6 4 10.5 9 12 5-1.5 9-6 9-12V6l-9-4z" fill="#5369EE" />
                </svg>
                <p className="text-[14px] leading-5 text-[#2E3F9E]">Private to you. We only use this to tailor {name}&apos;s plan and answers.</p>
              </div>
            </div>
          </>
        )}

        {step === "food" && (
          <>
            <Question title={`${capital(p.poss)} food, fountain and vet.`} sub="So reminders and advice fit what's already in their life." />
            <div className="flex flex-col gap-3">
              <Card className="flex flex-col gap-2.5">
                <span className="text-[13px] font-semibold text-slate">What does {p.subj} eat?</span>
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
              <div className="flex items-center gap-3.5 rounded-[18px] bg-navy px-[18px] py-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-blue">
                  <Drop size={20} />
                </span>
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className="text-base font-semibold text-white">AquaOne fountain</span>
                  <span className="text-[13px] text-[#B9C3DA]">From your order · care reminders set up</span>
                </span>
                <span className="flex size-[26px] items-center justify-center rounded-full bg-lilac">
                  <Check color="#071D3C" />
                </span>
              </div>
              <Card className="flex flex-col gap-2">
                <span className="text-[13px] font-semibold text-slate">{capital(p.poss)} vet (optional)</span>
                <input
                  value={form.vetName}
                  onChange={(e) => set("vetName", e.target.value)}
                  maxLength={80}
                  placeholder="Vet or clinic name"
                  className="h-12 rounded-xl bg-paper px-3.5 text-base font-medium outline-none"
                />
                <input
                  value={form.vetPhone}
                  onChange={(e) => set("vetPhone", e.target.value)}
                  maxLength={30}
                  inputMode="tel"
                  placeholder="Phone number"
                  className="h-12 rounded-xl bg-paper px-3.5 text-base font-medium outline-none"
                />
              </Card>
            </div>
          </>
        )}

        {step === "reminders" && (
          <>
            <Question title="How should we nudge you?" sub="Gentle nudges for the plan and the fountain. Never spam." />
            <div className="flex flex-col gap-3">
              <div className="flex flex-col rounded-[18px] bg-white px-[18px] py-1">
                <ToggleRow
                  title="Email"
                  sub="Reminders and the monthly summary"
                  on={form.remindByEmail}
                  onToggle={() => set("remindByEmail", !form.remindByEmail)}
                />
                <ToggleRow title="Text message" sub="Coming soon" on={false} disabled />
              </div>
              <Card className="flex flex-col gap-2.5">
                <span className="text-[13px] font-semibold text-slate">Best time for {p.poss} daily check-in</span>
                <Segmented
                  options={[
                    { value: "08:00", label: "Morning", sub: "8 am" },
                    { value: "12:00", label: "Midday", sub: "12 pm" },
                    { value: "19:00", label: "Evening", sub: "7 pm" },
                  ]}
                  value={form.checkinTime}
                  onChange={(v) => set("checkinTime", v)}
                />
              </Card>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col gap-3 px-7 pt-6 pb-10">
        {error ? <p role="alert" className="rounded-2xl bg-[#FDECEE] px-4 py-3 text-[14px] text-[#8E2335]">{error}</p> : null}
        {step === "reminders" ? (
          <PrimaryButton onClick={save} disabled={busy}>{busy ? "Building…" : `Build ${name}'s plan`}</PrimaryButton>
        ) : (
          <PrimaryButton onClick={next} disabled={!canContinue}>Continue</PrimaryButton>
        )}
        <p className="text-center text-[13px] text-[#8A93A8]">
          {step === "reminders" ? "Change these any time in Settings." : step === "health" ? "Update it any time the vet says something new." : "You can change any answer later."}
        </p>
      </div>
    </div>
  );
}

// "an 8-year-old", "an 11-year-old", "an 18-year-old"; otherwise "a".
export const article = (age: number) => (/^(8|11|18)$/.test(String(Math.trunc(age))) ? "an" : "a");

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Question({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex flex-col gap-2.5">
      <h1 className="text-[30px] leading-[35px] font-medium tracking-tight">{title}</h1>
      <p className="text-[17px] leading-6 text-slate">{sub}</p>
    </div>
  );
}

function RoundButton({ label, onClick, sign, dark }: { label: string; onClick: () => void; sign: "plus" | "minus"; dark?: boolean }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className={`flex size-11 items-center justify-center rounded-full ${dark ? "bg-navy" : "bg-[#F1F0ED]"}`}>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
        <path d={sign === "plus" ? "M7 2v10M2 7h10" : "M2 7h10"} stroke={dark ? "#fff" : "#071D3C"} strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function ToggleRow({ title, sub, on, onToggle, disabled }: { title: string; sub: string; on: boolean; onToggle?: () => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-3.5 border-b border-[#EFEDE9] py-3.5 last:border-b-0">
      <span className={`flex flex-1 flex-col gap-0.5 ${disabled ? "opacity-50" : ""}`}>
        <span className="text-base font-semibold">{title}</span>
        <span className="text-[13px] text-slate">{sub}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={title}
        disabled={disabled}
        onClick={onToggle}
        className={`flex h-[31px] w-[51px] shrink-0 items-center rounded-full p-0.5 ${on ? "justify-end bg-blue" : "justify-start bg-line"} disabled:opacity-50`}
      >
        <span className="size-[27px] rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.15)]" />
      </button>
    </div>
  );
}
