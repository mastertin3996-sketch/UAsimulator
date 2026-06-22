import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Виведення USD ще не доступне" }, { status: 501 });
}
