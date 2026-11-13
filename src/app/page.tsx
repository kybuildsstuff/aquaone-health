export default function Welcome() {
  return (
    <div className="flex min-h-dvh flex-col bg-navy px-7 pb-10 text-white">
      <div className="flex flex-1 items-center justify-center">
        <div className="flex size-28 items-center justify-center rounded-full bg-blue shadow-[0_20px_60px_rgba(83,105,238,0.55)]">
          <svg width="44" height="52" viewBox="0 0 16 18" aria-hidden>
            <path d="M8 1.5C8 1.5 2 8 2 11.5a6 6 0 0 0 12 0C14 8 8 1.5 8 1.5z" fill="#fff" />
          </svg>
        </div>
      </div>
      <p className="text-[13px] font-semibold tracking-[0.12em] text-lilac">AQUAONE HEALTH</p>
      <h1 className="mt-3 text-[34px] leading-[39px] font-medium tracking-tight">Let&apos;s get to know your cat.</h1>
      <p className="mt-3 text-[17px] leading-6 text-[#B9C3DA]">Two minutes, a few easy questions. Everything after is built around them.</p>
      <a href="/sign-in" className="mt-7 flex h-14 items-center justify-center rounded-full bg-white text-[17px] font-semibold text-navy">Sign in</a>
    </div>
  );
}
