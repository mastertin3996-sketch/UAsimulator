import { NextResponse } from "next/server";

export async function PATCH() {
  return NextResponse.json({ error: "Функція в розробці" }, { status: 501 });
}

export async function DELETE() {
  return NextResponse.json({ error: "Функція в розробці" }, { status: 501 });
}
