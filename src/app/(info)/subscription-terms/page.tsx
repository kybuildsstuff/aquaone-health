import Link from "next/link";
import { Doc, H2, List, Mail } from "../Doc";

// The same text as the store's subscription policy (Shopify: Settings → Policies → Purchase options
// cancellation policy, approved by Ky 15 Nov 2026; source in ky-workspace aquaone-health/subscription_policy.md).
// Change both together. Lawyer review in December.
export const metadata = { title: "Subscription terms · AquaOne Health" };

export default function SubscriptionTerms() {
  return (
    <Doc title="Subscription terms" updated="November 16, 2026">
      <p>
        This policy explains how an AquaOne Health membership works: what it costs, how it renews, how to cancel, and when refunds apply. AquaOne
        Health is run by PureStream, a business of KYLO LLC (&quot;we&quot;, &quot;us&quot;). It sits alongside our{" "}
        <Link href="/terms" className="font-semibold text-blue">Terms of use</Link> and{" "}
        <Link href="/privacy" className="font-semibold text-blue">Privacy policy</Link>.
      </p>

      <H2>How it works</H2>
      <ol className="flex list-decimal flex-col gap-1.5 pl-5">
        <li><b>Your first 30 days are free.</b> AquaOne Health is added at $0 when you buy an AquaOne with the AquaOne Health option switched on.</li>
        <li><b>Then $19.95 every 30 days.</b> After your free month, your membership renews automatically at $19.95 every 30 days, plus any sales tax that applies where you live, until you cancel.</li>
        <li><b>We remind you first.</b> We email you before your first charge, with the date and the price, so you have time to decide.</li>
        <li><b>Cancel any time.</b> Cancel before your free month ends and you&apos;re never charged.</li>
      </ol>

      <H2>Billing</H2>
      <List
        items={[
          "We charge the card or payment method you used at checkout on trypurestream.com.",
          "Renewals happen every 30 days from the date of your order, not on the same date each month.",
          "One membership covers up to four cats.",
          "Memberships can't be skipped or delayed.",
        ]}
      />

      <H2>How to cancel</H2>
      <p>You can cancel any time, in a few taps:</p>
      <List
        items={[
          <><b>In the app:</b> open Account, tap Cancel membership, and follow the steps.</>,
          <><b>On our website:</b> sign in to your account at trypurestream.com and cancel your AquaOne Health subscription.</>,
        ]}
      />
      <p>When you cancel, we may offer you a discount to stay. Taking it is up to you, and each customer can receive it once.</p>
      <p>If you have any trouble cancelling, email <Mail /> and we&apos;ll help you finish.</p>
      <p>
        Your AquaOne Health membership is separate from your fountain order. Returning or refunding your AquaOne doesn&apos;t cancel your membership,
        so please cancel it as well if you no longer want it.
      </p>

      <H2>After you cancel</H2>
      <p>
        You keep full access until the end of your free month or the 30-day period you&apos;ve already paid for, whichever is later. After that, the
        app stops working for you and you won&apos;t be charged again. Your cat&apos;s history is kept for 12 months, so it&apos;s there if you come back.
      </p>

      <H2>Refunds</H2>
      <p>
        Because we email you before your first charge and you can cancel at any time before it, <b>membership charges are non-refundable</b>,
        including renewals and any unused part of a 30-day period.
      </p>
      <p>
        We will refund a charge in full if it was our mistake, for example if you were charged after you cancelled, or charged twice for the same
        period. Email <Mail /> with the email address on your membership and we&apos;ll put it right.
      </p>

      <H2>If a payment fails</H2>
      <p>
        If a renewal payment doesn&apos;t go through, access to the app is paused until it does. Updating your payment details in your PureStream
        account fixes it. If we still can&apos;t collect payment, we may cancel your membership.
      </p>

      <H2>Discounts</H2>
      <p>
        If you accept a discount to stay, it applies to every renewal for as long as your membership stays active. It ends if your membership is
        cancelled or ends, and it can&apos;t be combined with other offers or transferred.
      </p>

      <H2>Changes to the price or this policy</H2>
      <p>
        If we change the price, we&apos;ll email you at least 30 days before your next charge at the new price, so you can cancel first if you want
        to. If we change this policy in a way that matters, we&apos;ll tell you by email or in the app before the change applies. We may change or end
        the free month for new customers at any time; that never affects a membership you already have.
      </p>

      <H2>Your rights</H2>
      <p>Nothing in this policy limits consumer rights or remedies that can&apos;t legally be excluded under applicable law.</p>

      <H2>Contact</H2>
      <p>
        Questions about your membership? Email <Mail />. We aim to reply within 1–2 business days.
      </p>
    </Doc>
  );
}
