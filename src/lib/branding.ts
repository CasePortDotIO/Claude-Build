import type { Org } from "@prisma/client";

/**
 * White-label branding resolution (§10). When a client org sets a brand, its
 * users see THAT brand — never "The Warm Sweep". The default (no brand, or the
 * agency's own workspace) shows the product branding.
 */
export interface Branding {
  name: string;
  tagline: string;
  color: string; // accent for the brand mark
  poweredBy: string | null; // agency name, shown small for white-label clients
  whiteLabel: boolean;
}

const DEFAULT_COLOR = "#5CA98A";

export function resolveBranding(org: Pick<Org, "name" | "brandName" | "brandColor" | "type"> | null, agencyName?: string | null): Branding {
  if (org?.brandName) {
    return {
      name: org.brandName,
      tagline: "Coach. Don't Chase.",
      color: org.brandColor || DEFAULT_COLOR,
      poweredBy: agencyName ?? null,
      whiteLabel: true,
    };
  }
  return {
    name: "The Warm Sweep™",
    tagline: "Coach. Don't Chase.",
    color: DEFAULT_COLOR,
    poweredBy: "by Delegate and Done",
    whiteLabel: false,
  };
}
