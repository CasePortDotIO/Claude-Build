import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { assertDomainAuthorized, DomainAuthError } from "@/lib/compliance/deliverability";

describe("§4 send-time domain-auth gate", () => {
  const tag = `auth-${Math.random().toString(36).slice(2, 8)}`;
  const ids: string[] = [];

  async function mkOrg(data: { fromDomain?: string | null; domainAuthOk?: boolean }) {
    const o = await prisma.org.create({
      data: { name: `Org ${tag}-${ids.length}`, slug: `org-${tag}-${ids.length}`, type: "CLIENT", ...data },
    });
    ids.push(o.id);
    return o.id;
  }

  beforeAll(() => {});
  afterAll(async () => {
    for (const id of ids) await prisma.org.delete({ where: { id } }).catch(() => {});
  });

  it("allows sending when no custom domain is set (provider-managed)", async () => {
    const id = await mkOrg({ fromDomain: null });
    await expect(assertDomainAuthorized(id)).resolves.toBeUndefined();
  });

  it("BLOCKS sending when a custom domain has not passed SPF/DMARC", async () => {
    const id = await mkOrg({ fromDomain: "mail.acme.com", domainAuthOk: false });
    await expect(assertDomainAuthorized(id)).rejects.toBeInstanceOf(DomainAuthError);
  });

  it("allows sending once the custom domain is verified", async () => {
    const id = await mkOrg({ fromDomain: "mail.acme.com", domainAuthOk: true });
    await expect(assertDomainAuthorized(id)).resolves.toBeUndefined();
  });
});
