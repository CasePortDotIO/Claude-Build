import type { DefaultSession } from "next-auth";

// Extend the session/user with the active org + role we put on the JWT.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      activeOrgId: string | null;
      activeRole: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    activeOrgId?: string | null;
    activeRole?: string | null;
  }
}
