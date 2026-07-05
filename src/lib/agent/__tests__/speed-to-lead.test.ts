import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Mock the heavy drafting/send stack — we're testing selection + gating, not the
// draft/send pipelines (covered by their own suites). Keep DraftGuardError real.
vi.mock("@/lib/agent/draft", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/agent/draft")>();
  return { ...actual, generateDraftsForLead: vi.fn(async () => {}) };
});
vi.mock("@/lib/agent/autosend", () => ({ autoApproveAndSend: vi.fn(async () => ({ approved: 0, sent: 0 })) }));
vi.mock("@/lib/agent/send", () => ({ sendAllApproved: vi.fn(async () => ({ sent: 0 })) }));

import { prisma } from "@/lib/prisma";
import { runSpeedToLeadForOrg } from "@/lib/agent/speed-to-lead";
import { generateDraftsForLead } from "@/lib/agent/draft";
import { autoApproveAndSend } from "@/lib/agent/autosend";

const gen = vi.mocked(generateDraftsForLead);
const autosend = vi.mocked(autoApproveAndSend);
const MIN = 60_000;

describe("speed-to-lead", () => {
  const tag = `stl-${Math.random().toString(36).slice(2, 8)}`;
  const orgIds: string[] = [];

  async function makeOrg(over: Record<string, unknown>): Promise<string> {
    const o = await prisma.org.create({
      data: { name: `Org ${tag}-${orgIds.length}`, slug: `org-${tag}-${orgIds.length}`, type: "CLIENT", ...over },
    });
    orgIds.push(o.id);
    return o.id;
  }
  async function makeLead(orgId: string, minutesAgo: number): Promise<string> {
    const at = new Date(Date.now() - minutesAgo * MIN);
    const l = await prisma.lead.create({
      data: { orgId, email: `l-${tag}-${Math.random().toString(36).slice(2, 7)}@x.com`, status: "NEW", createdAt: at },
    });
    return l.id;
  }

  beforeAll(() => {});
  afterAll(async () => {
    for (const id of orgIds) await prisma.org.delete({ where: { id } }).catch(() => {});
  });

  it("is a no-op for an org that hasn't turned on auto-drafting", async () => {
    gen.mockClear();
    const orgId = await makeOrg({ autopilotDraft: false });
    await makeLead(orgId, 1);
    const r = await runSpeedToLeadForOrg(orgId);
    expect(r.eligible).toBe(false);
    expect(gen).not.toHaveBeenCalled();
  });

  it("drafts only recent, not-yet-drafted new leads (inside the window)", async () => {
    gen.mockClear();
    autosend.mockClear();
    const orgId = await makeOrg({ autopilotDraft: true });
    const recent = await makeLead(orgId, 2); // inside the 15-min window
    await makeLead(orgId, 45); // too old — the 4h autopilot handles it

    const r = await runSpeedToLeadForOrg(orgId);

    expect(r.eligible).toBe(true);
    expect(r.drafted).toBe(1);
    expect(gen).toHaveBeenCalledTimes(1);
    expect(gen.mock.calls[0][0]).toMatchObject({ orgId, leadId: recent });
    // No auto-send configured → drafts queue, nothing is sent.
    expect(autosend).not.toHaveBeenCalled();
    expect(r.sent).toBe(0);
  });

  it("pushes drafts out when the org runs auto-approve", async () => {
    gen.mockClear();
    autosend.mockClear();
    const orgId = await makeOrg({ autopilotDraft: true, autopilotApprove: true });
    await makeLead(orgId, 1);
    await runSpeedToLeadForOrg(orgId);
    expect(autosend).toHaveBeenCalledTimes(1); // contacts within the SLA
  });
});
