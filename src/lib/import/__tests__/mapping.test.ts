import { describe, it, expect } from "vitest";
import { parseCsv, guessColumnMap } from "@/lib/import/csv";
import { applyMapping } from "@/lib/import/mapping";

describe("parseCsv", () => {
  it("parses headers and trims values, skipping empty lines", () => {
    const { headers, rows } = parseCsv("Email, First Name\n a@b.com , Dana \n\n c@d.com , Phil \n");
    expect(headers).toEqual(["Email", "First Name"]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ Email: "a@b.com", "First Name": "Dana" });
  });
});

describe("guessColumnMap", () => {
  it("maps common header synonyms to lead fields", () => {
    const map = guessColumnMap(["E-Mail", "First", "Company", "Notes"]);
    expect(map.email).toBe("E-Mail");
    expect(map.firstName).toBe("First");
    expect(map.company).toBe("Company");
    expect(map.originalInquiry).toBe("Notes");
  });

  it("maps last-contacted date headers to lastEngagedAt (coldness anchor)", () => {
    expect(guessColumnMap(["Email", "Last Contacted"]).lastEngagedAt).toBe("Last Contacted");
    expect(guessColumnMap(["Email", "Last Touch"]).lastEngagedAt).toBe("Last Touch");
  });
});

describe("applyMapping", () => {
  const parsed = parseCsv(
    "Email,First,Last,Junk\n" +
      "good@x.com,Dana,Klein,whatever\n" +
      "BAD-EMAIL,No,Email,x\n" +
      "good@x.com,Dupe,Row,x\n" +
      ",Missing,Email,x\n",
  );

  it("maps valid rows and skips invalid/duplicate/missing emails", () => {
    const { leads, skipped } = applyMapping(parsed, { email: "Email", firstName: "First", lastName: "Last" });
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ email: "good@x.com", firstName: "Dana", lastName: "Klein" });
    // invalid + duplicate + missing = 3 skipped
    expect(skipped).toHaveLength(3);
    expect(skipped.map((s) => s.reason).join(" ")).toMatch(/Invalid|Duplicate|Missing/);
  });

  it("lowercases emails for dedupe consistency", () => {
    const p = parseCsv("Email\nUser@Example.com\nuser@example.com\n");
    const { leads, skipped } = applyMapping(p, { email: "Email" });
    expect(leads).toHaveLength(1);
    expect(leads[0].email).toBe("user@example.com");
    expect(skipped).toHaveLength(1);
  });

  it("returns all rows skipped when email column is unmapped", () => {
    const { leads, skipped } = applyMapping(parsed, { firstName: "First" });
    expect(leads).toHaveLength(0);
    expect(skipped.length).toBe(parsed.rows.length);
  });

  it("passes the raw last-contacted value through for parsing at ingest", () => {
    const p = parseCsv("Email,Last Contacted\na@x.com,2025-06-01\n");
    const { leads } = applyMapping(p, { email: "Email", lastEngagedAt: "Last Contacted" });
    expect(leads[0].lastEngagedAt).toBe("2025-06-01");
  });
});
