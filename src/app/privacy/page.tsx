import type { Metadata } from "next";
import { LegalLayout, LegalSection } from "@/components/legal/LegalLayout";

export const metadata: Metadata = {
  title: "Privacy Policy · The Warm Sweep",
  description: "How The Warm Sweep collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" updated="June 29, 2026">
      <p>
        This Privacy Policy explains how The Warm Sweep (&ldquo;we&rdquo;, &ldquo;us&rdquo;) collects, uses, and
        protects information when you use our application and services (the &ldquo;Service&rdquo;). By using the
        Service you agree to the practices described here.
      </p>

      <LegalSection heading="Information we collect">
        <p>
          <strong>Account data:</strong> your name, email address, password (stored only as a salted hash), and
          workspace details you provide.
        </p>
        <p>
          <strong>Lead data you import:</strong> contact information and prior-conversation context for the leads you
          choose to re-engage. You are responsible for having a lawful basis to process these contacts (see our Terms).
          We act as a processor of this data on your behalf.
        </p>
        <p>
          <strong>Connected-account data:</strong> when you connect a mailbox (Google/Microsoft) or calendar, we store
          OAuth tokens needed to send and read messages on your behalf. Tokens are encrypted at rest.
        </p>
        <p>
          <strong>Usage &amp; technical data:</strong> log and diagnostic data needed to operate, secure, and improve the
          Service.
        </p>
      </LegalSection>

      <LegalSection heading="How we use information">
        <p>
          To provide the Service (drafting, sending, and tracking re-engagement on your behalf), to authenticate you,
          to process billing, to provide support, to maintain security and prevent abuse, and to comply with legal
          obligations. We do not sell your personal data.
        </p>
      </LegalSection>

      <LegalSection heading="Sub-processors">
        <p>We rely on the following providers to deliver the Service; each processes data only as needed:</p>
        <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
          <li>Hosting &amp; database: Vercel, Neon (PostgreSQL)</li>
          <li>Transactional email: Resend</li>
          <li>Payments: Stripe</li>
          <li>Mailbox &amp; calendar (when you connect them): Google, Microsoft, Cal.com / Calendly</li>
          <li>AI processing (when enabled): Anthropic, Voyage AI</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Email &amp; anti-spam">
        <p>
          The Service sends email from your connected mailbox. Every message includes a one-click unsubscribe and your
          physical mailing address, and we honor opt-outs and bounces by suppressing further contact. You must comply
          with applicable anti-spam laws (e.g., CAN-SPAM, GDPR/PECR) for the contacts you upload.
        </p>
      </LegalSection>

      <LegalSection heading="Security">
        <p>
          Data is encrypted in transit (TLS). Secrets and OAuth tokens are encrypted at rest using AES-256-GCM. Access
          is scoped per workspace, and we apply security headers, rate limiting, and least-privilege access controls. No
          system is perfectly secure, but we work to protect your data using industry-standard measures.
        </p>
      </LegalSection>

      <LegalSection heading="Data retention">
        <p>
          We retain account and workspace data for as long as your account is active. You may delete leads and other
          content at any time, and you can request deletion of your account and associated data by contacting us.
        </p>
      </LegalSection>

      <LegalSection heading="Your rights">
        <p>
          Depending on your jurisdiction, you may have the right to access, correct, export, or delete your personal
          data, and to object to or restrict certain processing. To exercise these rights, contact us using the details
          below. If you are an end-recipient of email sent through the Service, you can unsubscribe via the link in any
          message.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about this policy or your data? Email us at{" "}
          <a className="font-semibold text-sweep hover:underline" href="mailto:privacy@thewarmsweep.com">
            privacy@thewarmsweep.com
          </a>
          .
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
