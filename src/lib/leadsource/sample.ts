import type { LeadSourceKind } from "@prisma/client";
import type { RawLead } from "@/lib/leadsource/types";
import { normalizeLeads } from "@/lib/leadsource/types";

/**
 * Deterministic sample contacts per source, so the import-from-source flow is
 * fully demoable offline (no API key). Clearly synthetic (@example.com). Used
 * when a source is connected but has no live credentials.
 */
const SAMPLES: Record<string, RawLead[]> = {
  HUBSPOT: [
    { email: "lena.ford@example.com", firstName: "Lena", lastName: "Ford", company: "Ford Studio", originalInquiry: "asked about a brand audit last quarter" },
    { email: "raj.patel@example.com", firstName: "Raj", lastName: "Patel", company: "Patel & Co", originalInquiry: "downloaded the pricing guide" },
    { email: "mia.chen@example.com", firstName: "Mia", lastName: "Chen", originalInquiry: "booked then no-showed a discovery call" },
  ],
  GOOGLE_SHEETS: [
    { email: "owen.k@example.com", firstName: "Owen", lastName: "Knight", originalInquiry: "replied to the spring newsletter" },
    { email: "tara.s@example.com", firstName: "Tara", lastName: "Singh", company: "Singh Fitness", originalInquiry: "asked about group rates" },
  ],
  MAILCHIMP: [
    { email: "nina.l@example.com", firstName: "Nina", lastName: "Lopez", originalInquiry: "clicked the re-engagement campaign twice" },
    { email: "sam.w@example.com", firstName: "Sam", lastName: "Webb", originalInquiry: "long-time subscriber, never bought" },
  ],
  KAJABI: [
    { email: "cara.b@example.com", firstName: "Cara", lastName: "Bell", originalInquiry: "started the free course, didn't finish" },
    { email: "dev.m@example.com", firstName: "Dev", lastName: "Mehta", company: "Mehta Coaching", originalInquiry: "abandoned checkout on the mastermind" },
  ],
  CSV: [],
};

export function sampleLeadsFor(provider: LeadSourceKind): RawLead[] {
  return normalizeLeads(SAMPLES[provider] ?? []);
}
