import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Функція в розробці" }, { status: 501 });
}
