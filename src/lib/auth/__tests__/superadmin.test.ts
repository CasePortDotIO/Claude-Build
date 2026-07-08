import { describe, it, expect, afterEach } from "vitest";
import { isSuperadmin } from "@/lib/auth/superadmin";

describe("superadmin gate", () => {
  const original = process.env.SUPERADMIN_EMAILS;
  afterEach(() => { process.env.SUPERADMIN_EMAILS = original; });

  it("matches allowlisted emails case/space-insensitively and denies everyone else", () => {
    process.env.SUPERADMIN_EMAILS = "boss@co.com, Ops@Co.com";
    expect(isSuperadmin("boss@co.com")).toBe(true);
    expect(isSuperadmin("  BOSS@CO.COM ")).toBe(true);
    expect(isSuperadmin("ops@co.com")).toBe(true);
    expect(isSuperadmin("random@co.com")).toBe(false);
    expect(isSuperadmin(null)).toBe(false);
    expect(isSuperadmin(undefined)).toBe(false);
  });

  it("denies all when the allowlist is empty (fails closed)", () => {
    process.env.SUPERADMIN_EMAILS = "";
    expect(isSuperadmin("boss@co.com")).toBe(false);
  });
});
