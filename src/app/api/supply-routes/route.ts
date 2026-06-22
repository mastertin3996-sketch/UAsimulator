import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Stub — supply routes not yet implemented in UAeconomy engine
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ routes: [] });
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ error: "Маршрути постачання ще не реалізовані" }, { status: 501 });
}
