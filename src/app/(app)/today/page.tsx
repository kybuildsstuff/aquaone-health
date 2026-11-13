import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "Today · AquaOne Health" };

// Placeholder until the Today screen is built.
export default async function Today() {
  const supabase = await supabaseServer();
  const { data: cat } = await supabase.from("cats").select("name").order("created_at").limit(1).maybeSingle();
  if (!cat) redirect("/onboarding");
  return (
    <div className="flex min-h-dvh flex-col px-6 pt-12 pb-10">
      <p className="text-[14px] font-medium text-slate">Welcome</p>
      <h1 className="text-[30px] leading-[35px] font-medium tracking-tight">{cat.name}&apos;s day</h1>
      <div className="mt-6 flex flex-col gap-2 rounded-[24px] bg-navy p-5 text-white">
        <span className="text-xs font-bold tracking-[0.08em] text-lilac">TODAY — COMING NEXT</span>
        <span className="text-[17px] leading-6 text-[#C9D1E3]">The daily check-in, care plan and Kidney Watch land here next.</span>
      </div>
      <form action="/api/auth/sign-out" method="post" className="mt-auto flex justify-center pt-10">
        <button className="text-[14px] font-bold text-blue">Sign out</button>
      </form>
    </div>
  );
}
