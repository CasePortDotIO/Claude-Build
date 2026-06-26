import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signInSchema } from "@/lib/zod/org";

/**
 * Auth.js (NextAuth v5) config.
 *
 * v1 uses Credentials (email + password). OAuth mailbox connections (M3) are a
 * separate concern from *login* and live in the Connections layer, not here.
 *
 * The JWT carries the user's active org + role so server actions can authorize
 * without a DB round-trip on every call. A user can belong to multiple orgs;
 * for v1 we resolve the first membership as active (org switcher comes later).
 */
export const { handlers, auth, signIn, signOut, unstable_update: updateSession } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/sign-in" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (raw) => {
        const parsed = signInSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email },
          include: { memberships: { include: { org: true }, orderBy: { createdAt: "asc" } } },
        });
        if (!user?.passwordHash) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        const membership = user.memberships[0];
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          activeOrgId: membership?.orgId ?? null,
          activeRole: membership?.role ?? null,
        } as {
          id: string;
          name: string | null;
          email: string;
          activeOrgId: string | null;
          activeRole: string | null;
        };
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user, trigger, session }) => {
      if (user) {
        token.uid = (user as { id: string }).id;
        token.activeOrgId = (user as { activeOrgId: string | null }).activeOrgId;
        token.activeRole = (user as { activeRole: string | null }).activeRole;
      }
      // Org switch: re-issue the token's active org/role, but ONLY after
      // re-verifying the user actually belongs to the target org (the action
      // checks membership and passes the validated role).
      if (trigger === "update" && session?.activeOrgId && token.uid) {
        const membership = await prisma.membership.findUnique({
          where: { userId_orgId: { userId: token.uid as string, orgId: session.activeOrgId } },
        });
        if (membership) {
          token.activeOrgId = membership.orgId;
          token.activeRole = membership.role;
        }
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = token.uid as string;
        session.user.activeOrgId = (token.activeOrgId as string | null) ?? null;
        session.user.activeRole = (token.activeRole as string | null) ?? null;
      }
      return session;
    },
  },
});
