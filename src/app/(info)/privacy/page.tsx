import { Doc, H2, List, Mail } from "../Doc";

// Draft — under legal review (decision 12: Claude drafts plain-English terms for launch; a
// lawyer reviews them in December). Not marked on the page itself.
export const metadata = { title: "Privacy policy · AquaOne Health" };

export default function Privacy() {
  return (
    <Doc title="Privacy policy" updated="November 17, 2026">
      <p>
        This policy explains what AquaOne Health collects, why, and what you can do about it. AquaOne Health is run by PureStream, a business of KYLO LLC.
        The short version: we collect what the app needs to look after your cat, we use a few trusted companies to run it, and <b>we never sell your data</b>.
      </p>

      <H2>What we collect</H2>
      <List
        items={[
          <><b>Your email address</b>, to sign you in and send you emails about your membership and your cat.</>,
          <><b>Your membership details</b> from our store: your customer and subscription numbers, status, and renewal dates. We never see or store your card number.</>,
          <><b>Your cat&apos;s profile</b>: name, age, rough weight, indoor or outdoor, food, any health conditions you pick, and your vet&apos;s name and phone number if you add them.</>,
          <><b>What you log</b>: daily drinking check-ins, weigh-ins, breathing counts and the care tasks you tick.</>,
          <><b>Your messages to the assistant (Ask)</b> and its answers.</>,
          <><b>Photos you send</b> to identify a plant, food or product in Is it safe?.</>,
          <><b>Your reminder settings</b> and time zone.</>,
          <><b>Basic technical logs</b> (such as when a request failed), which we use to keep the app working.</>,
        ]}
      />

      <H2>How we use it</H2>
      <List
        items={[
          "To run the app: your care plan, Kidney Watch, answers, reports and reminders.",
          "To send emails you'd expect: sign-in codes, your welcome email, the reminder before your first charge, and reminders you turned on.",
          "To keep the app safe and working, and to answer you when you write to us.",
        ]}
      />
      <p>We don&apos;t use your information for advertising, and we don&apos;t sell it or share it for others&apos; marketing.</p>

      <H2>Who helps us run the app</H2>
      <p>These companies process information for us, only to provide their service:</p>
      <List
        items={[
          <><b>Supabase</b>: our database and sign-in.</>,
          <><b>Vercel</b>: hosts the app.</>,
          <><b>Anthropic</b>: the AI model behind Ask and photo identification. Your message or photo, with your cat&apos;s profile and recent check-ins, is sent to it to produce an answer.</>,
          <><b>Resend</b>: sends our emails.</>,
          <><b>Loop Subscriptions and Shopify</b>: our store and the billing of your membership.</>,
        ]}
      />
      <p>We may also share information if the law requires it, or to protect someone&apos;s safety.</p>

      <H2>Shared reports</H2>
      <p>If you share a vet report, anyone with that link can see that report until the link expires or you turn it off.</p>

      <H2>How long we keep it</H2>
      <p>
        We keep your information while you are a member. If your membership ends, we keep your cat&apos;s history for 12 months so it&apos;s there if you
        come back, then delete it. You can ask us to delete it sooner at any time.
      </p>

      <H2>Your choices</H2>
      <List
        items={[
          <>You can see and change your cat&apos;s details in the app, under Account.</>,
          <>To get a copy of your data, or to have it deleted, write to <Mail /> from the email you sign in with. We will do it within 30 days.</>,
          "You can turn reminder emails off in the app. Membership emails, like the reminder before a charge, always come through while you are a member.",
        ]}
      />

      <H2>Keeping it safe</H2>
      <p>
        Your data is stored with access controls so each member can only ever see her own cat. Connections are encrypted. No system is perfectly secure,
        but we work to protect what you trust us with.
      </p>

      <H2>Children</H2>
      <p>AquaOne Health is for adults. We don&apos;t knowingly collect information from children under 13.</p>

      <H2>Changes</H2>
      <p>If we change this policy in a way that matters, we will tell you by email or in the app.</p>

      <H2>Contact</H2>
      <p>
        Questions or requests: <Mail />.
      </p>
    </Doc>
  );
}
