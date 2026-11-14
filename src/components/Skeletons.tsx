import { TabScreen } from "@/components/TabBar";

// Light outlines shown the instant a screen is tapped, while its data loads.
// They are also what Next.js prefetches, so most taps show the outline with no wait.
const Bar = ({ className = "" }: { className?: string }) => <span className={`block animate-pulse rounded-full bg-[#ECEAE6] ${className}`} />;
const Card = ({ h }: { h: string }) => <span className={`block animate-pulse rounded-[22px] bg-white ${h}`} />;

// A tab screen (Today, Watch, Safe?, Report): title, then cards, with the tab bar in place.
export function TabSkeleton({ cards = ["h-36", "h-52", "h-24"] }: { cards?: string[] }) {
  return (
    <TabScreen>
      <div aria-busy="true" aria-label="Loading" className="flex flex-col">
        <div className="flex flex-col gap-2.5 pt-[max(26px,env(safe-area-inset-top))] pl-6">
          <Bar className="h-3.5 w-24" />
          <Bar className="h-7 w-48" />
        </div>
        <div className="flex flex-col gap-3 px-5 pt-6">
          {cards.map((h, i) => (
            <Card key={i} h={h} />
          ))}
        </div>
      </div>
    </TabScreen>
  );
}

// Ask: the chat header and an empty conversation.
export function AskSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="page-in flex h-dvh flex-col bg-paper">
      <div className="flex shrink-0 items-center gap-3 border-b border-[#EFEDE9] px-5 pt-[max(16px,env(safe-area-inset-top))] pb-3.5">
        <span className="size-10 shrink-0 rounded-full bg-blue" />
        <div className="flex flex-col gap-2">
          <Bar className="h-4 w-36" />
          <Bar className="h-3 w-48" />
        </div>
      </div>
      <div className="flex flex-col gap-3 px-5 pt-6">
        <Card h="h-20" />
        <Card h="h-12 w-3/4" />
      </div>
    </div>
  );
}

// Any other screen (account, sub-pages): a title and two blocks, no tab bar.
export function PlainSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="page-in flex min-h-dvh flex-col gap-3 px-5 pt-[max(26px,env(safe-area-inset-top))]">
      <Bar className="h-7 w-44" />
      <Card h="h-28" />
      <Card h="h-40" />
    </div>
  );
}
