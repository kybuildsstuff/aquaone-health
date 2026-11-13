import { RowGroup, RowLink, ScreenHeader } from "../parts";
import { HELP_EMAIL } from "@/lib/email";

export const metadata = { title: "About and legal · AquaOne Health" };

// About and legal (Paper: Legal and "not a vet").
export default function LegalPage() {
  const points = ["Any warning sign, we send you to a vet", "Plant and food answers come from our own list, not guessed by AI", "Your cat's data is yours. We never sell it"];
  return (
    <div className="flex min-h-dvh flex-col gap-3.5 px-5 pb-12">
      <ScreenHeader title="About and legal" back="/account" />
      <section className="flex flex-col gap-3.5 rounded-[22px] bg-navy px-5 py-6 text-white">
        <h2 className="text-[24px] leading-[30px] font-semibold">Guidance, not a vet</h2>
        <p className="text-[16px] leading-6 text-[#C9D1E3]">
          AquaOne Health helps you notice changes and know what to ask. It doesn&apos;t diagnose or treat, and it never replaces your vet. In an emergency,
          call your vet or an emergency vet straight away.
        </p>
        <ul className="flex flex-col gap-2.5">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-2.5 text-[15px] leading-[21px]">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-blue text-[11px]" aria-hidden>
                ✓
              </span>
              {p}
            </li>
          ))}
        </ul>
      </section>
      <RowGroup>
        <RowLink href="/terms" title="Terms of use" />
        <RowLink href="/privacy" title="Privacy policy" />
        <RowLink href="/subscription-terms" title="Subscription terms" />
        <RowLink href={`mailto:${HELP_EMAIL}?subject=My%20AquaOne%20Health%20data`} title="Download or delete my data" sub={`Write to ${HELP_EMAIL}`} external />
      </RowGroup>
      <p className="text-center text-[13px] leading-[18px] text-[#8A93A8]">AquaOne Health by PureStream · KYLO LLC</p>
    </div>
  );
}
