import { describe, it, expect } from "vitest";
import { googleSheetExportUrl } from "@/lib/import/google-sheet";

describe("google sheet export url", () => {
  it("builds the CSV export url from a share link (default gid)", () => {
    expect(googleSheetExportUrl("https://docs.google.com/spreadsheets/d/ABC123-_xyz/edit#gid=0")).toBe(
      "https://docs.google.com/spreadsheets/d/ABC123-_xyz/export?format=csv&gid=0",
    );
  });

  it("preserves a specific tab (gid)", () => {
    expect(googleSheetExportUrl("https://docs.google.com/spreadsheets/d/ID9/edit#gid=4242")).toBe(
      "https://docs.google.com/spreadsheets/d/ID9/export?format=csv&gid=4242",
    );
  });

  it("only ever targets docs.google.com — no SSRF to arbitrary hosts", () => {
    // A non-Sheets URL is rejected outright.
    expect(googleSheetExportUrl("https://evil.example.com/steal")).toBeNull();
    // An attacker-controlled host in the string can't redirect the target: the
    // built URL is always the google host from the extracted id.
    const built = googleSheetExportUrl("https://docs.google.com/spreadsheets/d/SAFEID/edit?x=https://evil.com");
    expect(built?.startsWith("https://docs.google.com/spreadsheets/d/SAFEID/export")).toBe(true);
  });

  it("returns null for junk", () => {
    expect(googleSheetExportUrl("not a url")).toBeNull();
    expect(googleSheetExportUrl("")).toBeNull();
  });
});
