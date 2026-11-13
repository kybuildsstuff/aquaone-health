import Link from "next/link";
import { Doc, H2, List, Mail } from "../Doc";

// Draft — under legal review (decision 12: Claude drafts plain-English terms for launch; a
// lawyer reviews them in December). Not marked on the page itself.
export const metadata = { title: "Terms of use · AquaOne Health" };

export default function Terms() {
  return (
    <Doc title="Terms of use" updated="November 17, 2026">
      <p>
        AquaOne Health is a web app that helps you look after your cat. It is run by PureStream, a business of KYLO LLC (&quot;we&quot;, &quot;us&quot;). By
        using it, you agree to these terms. If you don&apos;t agree, please don&apos;t use the app.
      </p>

      <H2>Guidance, not a vet</H2>
      <p>
        AquaOne Health gives general guidance to help you notice changes in your cat and know what to ask. It is not veterinary advice, it does not
        diagnose or treat any condition, and it never replaces a vet who has examined your cat. Kidney Watch, the care plan, the assistant (Ask) and Is it
        safe? can be wrong or incomplete.
      </p>
      <p>
        <b>In an emergency, or whenever you are worried about your cat, contact your vet or an emergency vet straight away.</b> Don&apos;t wait for the
        app, an email or a reply from us. If your cat may have eaten something poisonous, call your vet or a pet poison helpline now.
      </p>

      <H2>Your membership</H2>
      <p>
        You need an active AquaOne Health membership to use the app. How it is billed, renewed and cancelled is set out in our{" "}
        <Link href="/subscription-terms" className="font-semibold text-blue">Subscription terms</Link>. You sign in with your email address; please keep
        access to that inbox to yourself.
      </p>

      <H2>Using the app fairly</H2>
      <List
        items={[
          "Use the app for your own cats, and give information that is true to the best of your knowledge.",
          "Don't try to get into other people's accounts or data, overload or disrupt the app, or copy it.",
          "Don't use the assistant to produce anything unlawful or harmful.",
          "We may limit how many questions you can ask the assistant each day, to keep the service running well for everyone.",
        ]}
      />

      <H2>Your information</H2>
      <p>
        What you enter about your cat is yours. Our <Link href="/privacy" className="font-semibold text-blue">Privacy policy</Link> explains what we
        collect, why, and who helps us run the app. If you share a vet report link, anyone you give that link to can see that report until the link
        expires or you turn it off.
      </p>

      <H2>Changes and availability</H2>
      <p>
        We keep improving AquaOne Health, so features may change. We try to keep it running all the time but can&apos;t promise it will never be
        unavailable or error-free. If we change these terms in a way that matters, we will tell you by email or in the app before the change applies.
      </p>

      <H2>Our responsibility</H2>
      <p>
        The app is provided &quot;as is&quot;. To the extent the law allows, we are not responsible for decisions made about your cat&apos;s care based on
        the app, and our total responsibility to you for anything to do with the app is limited to the amount you paid us for it in the 12 months before
        the issue. Nothing in these terms limits rights you have under consumer law that can&apos;t be limited.
      </p>

      <H2>Ending</H2>
      <p>
        You can stop using the app and cancel any time. We may suspend or end access if these terms are seriously broken, and will tell you why where we
        can.
      </p>

      <H2>Law</H2>
      <p>These terms are governed by the laws of the State of Delaware, USA, without affecting any consumer protections where you live.</p>

      <H2>Contact</H2>
      <p>
        Questions about these terms? Write to <Mail />.
      </p>
    </Doc>
  );
}
