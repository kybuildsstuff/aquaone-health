import Link from "next/link";
import { Doc, H2, List, Mail } from "../Doc";

// Draft — under legal review (decision 12: Claude drafts plain-English terms for launch; a
// lawyer reviews them in December). Not marked on the page itself.
export const metadata = { title: "Subscription terms · AquaOne Health" };

export default function SubscriptionTerms() {
  return (
    <Doc title="Subscription terms" updated="November 17, 2026">
      <p>
        These terms explain how an AquaOne Health membership is billed and how to cancel it. AquaOne Health is run by PureStream (KYLO LLC). They sit
        alongside our <Link href="/terms" className="font-semibold text-blue">Terms of use</Link>.
      </p>

      <H2>Price</H2>
      <List
        items={[
          "Your first 30 days are free.",
          "After that, AquaOne Health costs $19.95 every 30 days, plus any sales tax that applies where you live.",
          "We charge the card or payment method you used at checkout on trypurestream.com.",
          "Your membership renews automatically every 30 days until you cancel.",
        ]}
      />

      <H2>Before your first charge</H2>
      <p>We email you 3 days before your free month ends, with the date and the price, so you have time to decide.</p>

      <H2>How to cancel</H2>
      <p>You can cancel any time, with no calls and no forms to send. Either:</p>
      <List
        items={[
          <>In the app, open <b>Account</b>, then tap <b>Manage or cancel membership</b>. This takes you to your PureStream account, where you choose Cancel subscription.</>,
          <>Or sign in to your account at trypurestream.com and cancel your AquaOne Health subscription there.</>,
          <>Or write to <Mail /> and we will cancel it for you.</>,
        ]}
      />
      <p>If you cancel before your free month ends, you are never charged.</p>

      <H2>What happens after you cancel</H2>
      <p>
        You keep full access until the end of your free month or the 30-day period you have already paid for, whichever is later. After that the app
        stops working for you and you won&apos;t be charged again. We don&apos;t give partial refunds for the rest of a period, except where the law
        requires it. If something went wrong with a charge, write to <Mail /> and we will look at it.
      </p>

      <H2>Pausing</H2>
      <p>
        If you pause your subscription, we treat it like a cancellation while it is paused: you keep access until the end of what you have already got
        (your free month or your paid period), then the app is locked until you resume. When you resume, billing and access start again.
      </p>

      <H2>If a payment fails</H2>
      <p>
        If a renewal payment doesn&apos;t go through, access to the app is paused until it does. Updating your card in your PureStream account fixes it.
      </p>

      <H2>Changes to the price</H2>
      <p>If we ever change the price, we will email you at least 30 days before your next charge at the new price, so you can cancel first if you want to.</p>

      <H2>Questions</H2>
      <p>
        Write to <Mail />.
      </p>
    </Doc>
  );
}
