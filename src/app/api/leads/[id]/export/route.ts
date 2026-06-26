import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/auth-helpers";
import { exportLead } from "@/lib/compliance/gdpr";

// GDPR data export (§9): download everything we hold about a lead as JSON.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrg();
  const { id } = await params;
  const data = await exportLead(ctx.orgId, id);
  if (!data) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="lead-${id}.json"`,
    },
  });
}
