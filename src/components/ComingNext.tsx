import { TabScreen } from "@/components/TabBar";

// A tab that isn't built yet, so nothing in the tab bar leads to a 404.
export default function ComingNext({ title, sub, children }: { title: string; sub: string; children?: React.ReactNode }) {
  return (
    <TabScreen>
      <div className="flex flex-1 flex-col gap-6 px-6 pt-[max(26px,env(safe-area-inset-top))]">
        <h1 className="text-3xl leading-8.75 font-medium tracking-[-0.02em]">{title}</h1>
        <div className="flex flex-col gap-2 rounded-3xl bg-navy p-5">
          <span className="text-xs font-bold tracking-[0.08em] text-lilac">COMING NEXT</span>
          <span className="text-[17px] leading-6 text-[#C9D1E3]">{sub}</span>
        </div>
        {children}
      </div>
    </TabScreen>
  );
}
