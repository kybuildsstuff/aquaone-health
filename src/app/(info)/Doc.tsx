import { BackLink } from "@/components/watch";

// Public pages (Help and the legal drafts): readable signed in or not (see PUBLIC_INFO in proxy.ts).
export function Doc({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col px-5 pb-14">
      <header className="flex items-center gap-3 pt-[max(20px,env(safe-area-inset-top))] pb-2">
        <BackLink href="/account" />
        <span className="text-[15px] font-semibold text-slate">AquaOne Health</span>
      </header>
      <h1 className="pt-4 text-[30px] leading-[35px] font-medium tracking-[-0.02em]">{title}</h1>
      {updated ? <p className="pt-1.5 text-[14px] text-slate">Last updated {updated}</p> : null}
      <article className="doc flex flex-col gap-4 pt-5 text-[16px] leading-[25px] text-[#24324A]">{children}</article>
    </div>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="pt-3 text-[19px] leading-6 font-semibold text-navy">{children}</h2>;
}

export function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

export const Mail = () => (
  <a href="mailto:help@trypurestream.com" className="font-semibold text-blue">
    help@trypurestream.com
  </a>
);
