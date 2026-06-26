"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrg } from "@/lib/auth-helpers";
import { eraseLead } from "@/lib/compliance/gdpr";

export interface ComplianceActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

/** GDPR erasure: delete a lead's personal data + keep the email suppressed. */
export async function eraseLeadAction(leadId: string): Promise<ComplianceActionResult> {
  const ctx = await requireOrg();
  const res = await eraseLead(ctx.orgId, leadId);
  if (!res.erased) return { ok: false, error: "Lead not found." };
  revalidatePath("/leads");
  revalidatePath("/");
  return { ok: true, message: `Erased ${res.email} and added to do-not-contact.` };
}

/** Manually add an email to the org suppression list. */
export async function suppressEmailAction(email: string): Promise<ComplianceActionResult> {
  const ctx = await requireOrg();
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return { ok: false, error: "Enter a valid email." };
  await prisma.suppressionEntry.upsert({
    where: { orgId_email: { orgId: ctx.orgId, email: clean } },
    create: { orgId: ctx.orgId, email: clean, reason: "MANUAL" },
    update: {},
  });
  // If a matching lead exists, take it out of rotation.
  await prisma.lead.updateMany({ where: { orgId: ctx.orgId, email: clean, status: { notIn: ["OPTED_OUT", "DO_NOT_CONTACT"] } }, data: { status: "DO_NOT_CONTACT" } });
  revalidatePath("/deliverability");
  return { ok: true, message: `${clean} suppressed.` };
}

export async function setMailingAddressAction(address: string): Promise<ComplianceActionResult> {
  const ctx = await requireOrg();
  const clean = address.trim();
  if (clean.length < 6) return { ok: false, error: "Enter your full physical mailing address (CAN-SPAM)." };
  await prisma.org.update({ where: { id: ctx.orgId }, data: { mailingAddress: clean } });
  revalidatePath("/connections");
  revalidatePath("/deliverability");
  return { ok: true, message: "Mailing address saved." };
}

/** Resume an auto-paused (or manually paused) mailbox. */
export async function resumeMailboxAction(mailboxId: string): Promise<ComplianceActionResult> {
  const ctx = await requireOrg();
  await prisma.mailbox.updateMany({ where: { id: mailboxId, orgId: ctx.orgId }, data: { status: "CONNECTED", pausedReason: null } });
  revalidatePath("/deliverability");
  revalidatePath("/connections");
  return { ok: true, message: "Mailbox resumed." };
}
