import { Suspense } from "react";
import CheckEmailForm from "./CheckEmailForm";

export const metadata = { title: "Check your email · AquaOne Health" };

export default function CheckEmailPage() {
  return (
    <Suspense>
      <CheckEmailForm />
    </Suspense>
  );
}
