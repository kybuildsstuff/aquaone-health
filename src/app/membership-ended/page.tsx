import { Drop } from "@/components/ui";
import { LOOP_PORTAL_URL } from "@/lib/account";

export const metadata = { title: "Membership · AquaOne Health" };

// A member whose card failed is still subscribed while Loop retries: she updates her card, she
// doesn't buy again (a second purchase would bill twice; audit, 15 Nov).
export default async function MembershipEnded({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  if (reason === "past_due") {
    return (
      <div className="flex min-h-dvh flex-col px-7 pt-16 pb-10">
        <div className="flex flex-1 flex-col gap-6">
          <div className="flex size-16 items-center justify-center rounded-[18px] bg-navy">
            <Drop size={24} color="#5369EE" />
          </div>
          <h1 className="text-[30px] leading-[35px] font-medium tracking-tight">Your last payment didn&apos;t go through</h1>
          <p className="text-[17px] leading-6 text-slate">
            Your membership is still here. Update your card and everything opens again, with your cat&apos;s history just as you left it.
            There&apos;s no need to buy it again.
          </p>
          <a href={LOOP_PORTAL_URL} className="flex h-14 items-center justify-center rounded-full bg-navy text-[17px] font-semibold text-white">
            Update my card
          </a>
          <p className="text-[14px] leading-5 text-slate">You&apos;ll sign in to the PureStream store with a code we email you. Questions? help@trypurestream.com</p>
        </div>
        <form action="/api/auth/sign-out" method="post" className="flex justify-center">
          <button className="text-[14px] font-bold text-blue">Sign out</button>
        </form>
      </div>
    );
  }
  return (
    <div className="flex min-h-dvh flex-col px-7 pt-16 pb-10">
      <div className="flex flex-1 flex-col gap-6">
        <div className="flex size-16 items-center justify-center rounded-[18px] bg-navy">
          <Drop size={24} color="#5369EE" />
        </div>
        <h1 className="text-[30px] leading-[35px] font-medium tracking-tight">Your membership isn&apos;t active</h1>
        <p className="text-[17px] leading-6 text-slate">
          It has ended. Your cat&apos;s history is kept for 12 months, so it&apos;s right
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
