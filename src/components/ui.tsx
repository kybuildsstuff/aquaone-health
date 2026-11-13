import Link from "next/link";

export function Drop({ size = 24, color = "#fff" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={(size * 18) / 16} viewBox="0 0 16 18" aria-hidden>
      <path d="M8 1.5C8 1.5 2 8 2 11.5a6 6 0 0 0 12 0C14 8 8 1.5 8 1.5z" fill={color} />
    </svg>
  );
}

const pill =
  "flex h-14 w-full items-center justify-center rounded-full text-[17px] font-semibold transition active:scale-[0.99] disabled:opacity-50";

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`${pill} bg-navy text-white ${props.className ?? ""}`} />;
}

export function LightButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`${pill} bg-white text-navy ${props.className ?? ""}`} />;
}

export function PillLink({ href, children, light }: { href: string; children: React.ReactNode; light?: boolean }) {
  return (
    <Link href={href} className={`${pill} ${light ? "bg-white text-navy" : "bg-navy text-white"}`}>
      {children}
    </Link>
  );
}

export function BackButton({ onClick, label = "Back" }: { onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick} aria-label={label} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white">
      <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden>
        <path d="M12.5 4L6.5 10l6 6" stroke="#071D3C" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export function Progress({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex flex-1 gap-1.5" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={total}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`h-1 flex-1 rounded-full ${i < step ? "bg-blue" : "bg-line"}`} />
      ))}
    </div>
  );
}

export function Check({ size = 12, color = "#fff" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden>
      <path d="M2 6.5L5 9L10 3" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-[18px] bg-white px-[18px] py-4 ${className}`}>{children}</div>;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; sub?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-2">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={on}
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl py-3 text-[15px] ${
              on ? "border-[1.5px] border-blue bg-lilac-soft font-semibold text-navy" : "border-[1.5px] border-line font-medium text-slate"
            }`}
          >
            {o.label}
            {o.sub ? <span className={`text-xs ${on ? "text-slate" : "text-[#8A93A8]"}`}>{o.sub}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
