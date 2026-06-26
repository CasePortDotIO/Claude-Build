"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signInSchema, signUpSchema } from "@/lib/zod/org";
import { signIn } from "@/lib/auth";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workspace"
  );
}

export interface ActionState {
  error?: string;
  ok?: boolean;
}

/**
 * Sign up = create User + Org + Membership(CLIENT_ADMIN) atomically, then log in.
 * The new org is a standalone CLIENT workspace (no parent agency in v1 sign-up).
 */
export async function signUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    orgName: formData.get("orgName"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { name, email, password, orgName } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "An account with that email already exists." };

  const passwordHash = await bcrypt.hash(password, 10);

  // Unique slug: append a short suffix on collision.
  let slug = slugify(orgName);
  if (await prisma.org.findUnique({ where: { slug } })) {
    slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { name, email, passwordHash } });
    const org = await tx.org.create({ data: { name: orgName, slug, type: "CLIENT" } });
    await tx.membership.create({ data: { userId: user.id, orgId: org.id, role: "CLIENT_ADMIN" } });
    await tx.auditLog.create({
      data: { orgId: org.id, actorId: user.id, action: "org.create", targetType: "Org", targetId: org.id },
    });
  });

  // signIn with redirect handled by the caller's redirect on success.
  await signIn("credentials", { email, password, redirect: false });
  return { ok: true };
}

export async function signInAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    await signIn("credentials", { ...parsed.data, redirect: false });
    return { ok: true };
  } catch {
    return { error: "Invalid email or password." };
  }
}
