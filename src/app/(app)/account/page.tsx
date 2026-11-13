import ComingNext from "@/components/ComingNext";

export const metadata = { title: "Account · AquaOne Health" };

export default function AccountPage() {
  return (
    <ComingNext title="Account" sub="Your cat's details, reminders and membership land here next.">
      <form action="/api/auth/sign-out" method="post" className="flex justify-center pt-4">
        <button className="text-[15px] font-bold text-blue">Sign out</button>
      </form>
    </ComingNext>
  );
}
