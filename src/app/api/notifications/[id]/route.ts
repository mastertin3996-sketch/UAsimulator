import { NextResponse } from "next/server";

// Virtual notifications have no persistence — return ok for PATCH/DELETE
export async function PATCH() {
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  return NextResponse.json({ ok: true });
}
