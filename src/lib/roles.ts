import type { Role } from "@prisma/client";

// Pure role-hierarchy logic, kept free of the auth/next-navigation chain so it's
// importable in tests and Edge contexts.
export const ROLE_RANK: Record<Role, number> = {
  MEMBER: 1,
  CLIENT_ADMIN: 2,
  AGENCY_ADMIN: 3,
};

/** Throw if `role` is below the required role. Higher roles cover lower ones. */
export function assertRole(ctx: { role: Role }, required: Role): void {
  if (ROLE_RANK[ctx.role] < ROLE_RANK[required]) {
    throw new Error(`Forbidden: requires ${required}`);
  }
}
