import type { Metadata } from "next";
import { LegalLayout, LegalSection } from "@/components/legal/LegalLayout";

export const metadata: Metadata = {
  title: "Terms of Service · The Warm Sweep",
  description: "The terms governing your use of The Warm Sweep.",
};

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" updated="June 29, 2026">
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of The Warm Sweep (the
        &ldquo;Service&rdquo;). By creating an account or using the Service, you agree to these Terms.
      </p>

      <LegalSection heading="The Service">
        <p>
          The Warm Sweep helps you re-engage prior contacts by drafting, sending, and tracking outreach from your
          connected mailbox, with your approval. Features depend on your plan and the integrations you connect.
        </p>
      </LegalSection>

      <LegalSection heading="Your responsibilities &amp; acceptable use">
        <p>You agree that you will:</p>
        <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
          <li>only upload contacts you have a lawful basis to email (e.g., prior business relationship or consent);</li>
          <li>comply with all applicable laws, including anti-spam laws (CAN-SPAM, CASL, GDPR/PECR) and the terms of
            any mailbox provider you connect;</li>
          <li>honor unsubscribe and do-not-contact requests (the Service helps enforce this automatically);</li>
          <li>not use the Service to send unlawful, deceptive, harassing, or unsolicited bulk content;</li>
          <li>keep your account credentials secure and be responsible for activity under your account.</li>
        </ul>
        <p>
          You are solely responsible for the content you send and the contacts you upload. We may suspend accounts that
          violate these Terms or that generate excessive spam complaints or bounces.
        </p>
      </LegalSection>

      <LegalSection heading="Billing">
        <p>
          Paid plans are billed through Stripe according to the plan you select. Fees are non-refundable except where
          required by law. You can manage or cancel your subscription from your account; access continues through the end
          of the paid period.
        </p>
      </LegalSection>

      <LegalSection heading="Intellectual property">
        <p>
          We retain all rights to the Service. You retain all rights to your data and content. You grant us a limited
          license to process your content solely to provide the Service to you.
        </p>
      </LegalSection>

      <LegalSection heading="Disclaimers &amp; limitation of liability">
        <p>
          The Service is provided &ldquo;as is&rdquo; without warranties of any kind. We do not guarantee any specific
          outcome (such as a number of booked calls or recovered revenue). To the maximum extent permitted by law, our
          aggregate liability arising from the Service is limited to the amounts you paid us in the twelve months before
          the claim.
        </p>
      </LegalSection>

      <LegalSection heading="Termination">
        <p>
          You may stop using the Service at any time. We may suspend or terminate access for violations of these Terms.
          On termination, you may request export or deletion of your data as described in our Privacy Policy.
        </p>
      </LegalSection>

      <LegalSection heading="Changes">
        <p>
          We may update these Terms from time to time. Material changes will be reflected by the &ldquo;Last
          updated&rdquo; date above; continued use after changes constitutes acceptance.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about these Terms? Email{" "}
          <a className="font-semibold text-sweep hover:underline" href="mailto:support@thewarmsweep.com">
            support@thewarmsweep.com
          </a>
          .
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
