import { Suspense } from "react";
import SignInForm from "./SignInForm";

export const metadata = { title: "Sign in · AquaOne Health" };

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
