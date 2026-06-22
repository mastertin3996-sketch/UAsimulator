import { NextResponse } from "next/server";

// Auto-replenish rules are not yet implemented in the engine schema.
// Return empty list so the UI renders cleanly.
export async function GET() {
  return NextResponse.json({ rules: [], enterprises: [], products: [] });
}

export async function POST() {
  return NextResponse.json({ error: "Функція в розробці" }, { status: 501 });
}
