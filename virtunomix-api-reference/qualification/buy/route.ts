import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buyLicense } from "@/lib/qualification";

// ─── POST /api/qualification/buy ─────────────────────────────────────────────
// Body: { licenseKey: string }

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { licenseKey?: string };
  if (!body.licenseKey?.trim()) {
    return NextResponse.json({ error: "licenseKey обов'язковий" }, { status: 400 });
  }

  const result = await buyLicense(session.user.id, body.licenseKey);

  if (!result.ok) {
    const status = result.code === "NOT_FOUND"         ? 404
                 : result.code === "INSUFFICIENT_PC"   ? 402
                 : 400;
    return NextResponse.json({ error: result.message, code: result.code }, { status });
  }

  return NextResponse.json({
    ok        : true,
    licenseId : result.licenseId,
    expiresAt : result.expiresAt,
  }, { status: 201 });
}
