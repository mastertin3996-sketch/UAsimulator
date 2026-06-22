import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getQualStatus, LICENSE_CATALOG } from "@/lib/qualification";

// ─── GET /api/qualification ───────────────────────────────────────────────────
// Returns player's current limits, usage, active licenses + shop catalog

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status = await getQualStatus(session.user.id);

  return NextResponse.json({
    ...status,
    catalog: LICENSE_CATALOG,
  });
}
