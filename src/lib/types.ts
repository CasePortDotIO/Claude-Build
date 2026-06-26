// Shared, client-safe domain types and display metadata.
// (No server-only imports here — this is imported by client components.)

import type { LeadStatus, Role, OrgType, ConsentBasis } from "@prisma/client";

export type { LeadStatus, Role, OrgType, ConsentBasis };

// The agent's lead lifecycle, in canonical order. Used by the Leads filters and
// (from M3) the state machine. Branch states are listed after the happy path.
export const LEAD_STATUS_ORDER: LeadStatus[] = [
  "NEW",
  "RESEARCHED",
  "DRAFTED",
  "AWAITING_APPROVAL",
  "SCHEDULED",
  "SENT",
  "AWAITING_REPLY",
  "REPLIED",
  "NEGOTIATING",
  "BOOKED",
  "BOUNCED",
  "OPTED_OUT",
  "DO_NOT_CONTACT",
  "COOLED",
  "CLOSED_LOST",
];

// Human label + the color family each status renders with (mirrors the mockup's
// pill styling: green = good, orange = needs/active, neutral = idle, red = dead).
export const LEAD_STATUS_META: Record<
  LeadStatus,
  { label: string; tone: "neutral" | "active" | "good" | "dead" }
> = {
  NEW: { label: "New", tone: "neutral" },
  RESEARCHED: { label: "Researched", tone: "neutral" },
  DRAFTED: { label: "Drafted", tone: "active" },
  AWAITING_APPROVAL: { label: "Awaiting approval", tone: "active" },
  SCHEDULED: { label: "Scheduled", tone: "active" },
  SENT: { label: "Sent", tone: "active" },
  AWAITING_REPLY: { label: "Awaiting reply", tone: "active" },
  REPLIED: { label: "Replied", tone: "good" },
  NEGOTIATING: { label: "Negotiating", tone: "good" },
  BOOKED: { label: "Booked", tone: "good" },
  BOUNCED: { label: "Bounced", tone: "dead" },
  OPTED_OUT: { label: "Opted out", tone: "dead" },
  DO_NOT_CONTACT: { label: "Do not contact", tone: "dead" },
  COOLED: { label: "Cooled", tone: "neutral" },
  CLOSED_LOST: { label: "Closed lost", tone: "dead" },
};

export const ROLE_LABEL: Record<Role, string> = {
  AGENCY_ADMIN: "Agency admin",
  CLIENT_ADMIN: "Client admin",
  MEMBER: "Member",
};

// The lead fields a CSV import can map onto. `email` is the only required one.
export const IMPORTABLE_FIELDS = [
  { key: "email", label: "Email", required: true },
  { key: "firstName", label: "First name", required: false },
  { key: "lastName", label: "Last name", required: false },
  { key: "company", label: "Company", required: false },
  { key: "phone", label: "Phone", required: false },
  { key: "originalInquiry", label: "Original inquiry", required: false },
  { key: "statedGoal", label: "Stated goal", required: false },
  { key: "region", label: "Region", required: false },
] as const;

export type ImportableFieldKey = (typeof IMPORTABLE_FIELDS)[number]["key"];
