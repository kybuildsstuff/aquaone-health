import { Drop } from "@/components/ui";

export const metadata = { title: "Membership · AquaOne Health" };

export default function MembershipEnded() {
  return (
    <div className="flex min-h-dvh flex-col px-7 pt-16 pb-10">
      <div className="flex flex-1 flex-col gap-6">
        <div className="flex size-16 items-center justify-center rounded-[18px] bg-navy">
          <Drop size={24} color="#5369EE" />
        </div>
        <h1 className="text-[30px] leading-[35px] font-medium tracking-tight">Your membership isn&apos;t active</h1>
        <p className="text-[17px] leading-6 text-slate">
          It may have ended, or a payment didn&apos;t go through. Your cat&apos;s history is kept for 12 months, so it&apos;s right
          here if you come back.
        </p>
        <a href="https://trypurestream.com" className="flex h-14 items-center justify-center rounded-full bg-navy text-[17px] font-semibold text-white">
          Rejoin AquaOne Health
        </a>
      </div>
      <form action="/api/auth/sign-out" method="post" className="flex justify-center">
        <button className="text-[14px] font-bold text-blue">Sign out</button>
      </form>
    </div>
  );
}
