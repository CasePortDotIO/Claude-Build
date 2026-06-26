import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

// tsx doesn't auto-load .env the way `prisma migrate` does; load it here so
// `npm run db:seed` works standalone. Minimal parser, no extra dependency.
const envPath = path.resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
}

const prisma = new PrismaClient();

// Seed a reseller (agency) that owns two client workspaces, each with its own
// admin + sample leads. Two separate client orgs make tenant isolation easy to
// see in the UI and is the fixture the tenancy test relies on conceptually.
async function main() {
  const passwordHash = await bcrypt.hash("warmsweep123", 10);

  // --- Agency (reseller) ---
  const agency = await prisma.org.upsert({
    where: { slug: "delegate-and-done" },
    update: {},
    create: { name: "Delegate and Done", slug: "delegate-and-done", type: "AGENCY", brandName: "Delegate and Done" },
  });

  // --- Client org A: Monroe Coaching ---
  const monroe = await prisma.org.upsert({
    where: { slug: "monroe-coaching" },
    update: {},
    create: {
      name: "Monroe Coaching",
      slug: "monroe-coaching",
      type: "CLIENT",
      parentAgencyId: agency.id,
      mailingAddress: "1200 Lakeview Dr, Austin, TX 78701",
    },
  });

  // --- Client org B: Apex Fitness (proves isolation from Monroe) ---
  const apex = await prisma.org.upsert({
    where: { slug: "apex-fitness" },
    update: {},
    create: {
      name: "Apex Fitness Studio",
      slug: "apex-fitness",
      type: "CLIENT",
      parentAgencyId: agency.id,
      mailingAddress: "55 Market St, Denver, CO 80202",
    },
  });

  const jessica = await prisma.user.upsert({
    where: { email: "jessica@monroe.coach" },
    update: { passwordHash },
    create: { name: "Jessica Monroe", email: "jessica@monroe.coach", passwordHash },
  });
  const marco = await prisma.user.upsert({
    where: { email: "marco@apexfit.co" },
    update: { passwordHash },
    create: { name: "Marco Diaz", email: "marco@apexfit.co", passwordHash },
  });

  await prisma.membership.upsert({
    where: { userId_orgId: { userId: jessica.id, orgId: monroe.id } },
    update: {},
    create: { userId: jessica.id, orgId: monroe.id, role: "CLIENT_ADMIN" },
  });
  // Jessica is also the agency admin (reseller view in M8).
  await prisma.membership.upsert({
    where: { userId_orgId: { userId: jessica.id, orgId: agency.id } },
    update: {},
    create: { userId: jessica.id, orgId: agency.id, role: "AGENCY_ADMIN" },
  });
  await prisma.membership.upsert({
    where: { userId_orgId: { userId: marco.id, orgId: apex.id } },
    update: {},
    create: { userId: marco.id, orgId: apex.id, role: "CLIENT_ADMIN" },
  });

  // Sample leads per client org.
  const monroeLeads = [
    { email: "dana.k@gmail.com", firstName: "Dana", lastName: "Klein", company: "Freelance", originalInquiry: "Wanted help pricing her 1:1 coaching packages", statedGoal: "Replace her salary with coaching income", toneRead: "warm, hesitant", region: "US-TX" },
    { email: "phil@growthlab.io", firstName: "Phil", lastName: "Owens", company: "GrowthLab", originalInquiry: "Asked about the 8-week accountability program", statedGoal: "Stay consistent on a launch", toneRead: "direct", region: "US-CA" },
    { email: "sara.bennett@outlook.com", firstName: "Sara", lastName: "Bennett", company: "Bennett Studio", originalInquiry: "Inquired about group coaching cohort", statedGoal: "Build a peer support circle", toneRead: "enthusiastic", region: "US-NY" },
    { email: "tom.h@protonmail.com", firstName: "Tom", lastName: "Harris", originalInquiry: "Downloaded the goal-setting guide, never replied", statedGoal: "Get unstuck after a career change", toneRead: "guarded", region: "UK" },
  ];
  const apexLeads = [
    { email: "rachel@fitmail.com", firstName: "Rachel", lastName: "Vance", originalInquiry: "Asked about the 90-day transformation", statedGoal: "Lose 20lb before her wedding", toneRead: "motivated", region: "US-CO" },
    { email: "deepa@startup.dev", firstName: "Deepa", lastName: "Rao", company: "Startup.dev", originalInquiry: "Inquired about corporate wellness", statedGoal: "Lower team burnout", toneRead: "analytical", region: "US-WA" },
  ];

  for (const l of monroeLeads) {
    await prisma.lead.upsert({
      where: { orgId_email: { orgId: monroe.id, email: l.email } },
      update: {},
      create: { ...l, orgId: monroe.id, source: "seed", consentBasis: "PRIOR_INQUIRY", priorContact: true, status: "NEW" },
    });
  }
  for (const l of apexLeads) {
    await prisma.lead.upsert({
      where: { orgId_email: { orgId: apex.id, email: l.email } },
      update: {},
      create: { ...l, orgId: apex.id, source: "seed", consentBasis: "PRIOR_INQUIRY", priorContact: true, status: "NEW" },
    });
  }

  // A suppression entry in Monroe so import-filtering is demonstrable.
  await prisma.suppressionEntry.upsert({
    where: { orgId_email: { orgId: monroe.id, email: "optedout@example.com" } },
    update: {},
    create: { orgId: monroe.id, email: "optedout@example.com", reason: "OPTED_OUT" },
  });

  console.log("Seed complete:");
  console.log("  Agency:  Delegate and Done");
  console.log("  Client A: Monroe Coaching  — login jessica@monroe.coach / warmsweep123  (4 leads)");
  console.log("  Client B: Apex Fitness     — login marco@apexfit.co   / warmsweep123  (2 leads)");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
