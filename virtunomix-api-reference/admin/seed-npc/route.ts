import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { NPC_COMPANY_ID, NPC_USER_ID } from "@/lib/npc-config";

export async function GET(req: NextRequest) { return POST(req); }

export async function POST(_req: NextRequest) {
  try {
    // ── 1. Системний NPC-юзер ────────────────────────────────────────────────
    const user = await prisma.user.upsert({
      where : { id: NPC_USER_ID },
      update: {},
      create: {
        id          : NPC_USER_ID,
        email       : "npc-premium@virtunomix.system",
        username    : "npc_premium_supplier",
        passwordHash: null,
        isActive    : false, // не може логінитися
        role        : "SYSTEM",
      },
    });

    // ── 2. Гаманець NPC (ігровий sink) ───────────────────────────────────────
    await prisma.userWallet.upsert({
      where : { userId: NPC_USER_ID },
      update: {},
      create: {
        userId   : NPC_USER_ID,
        gameCash : 999_999_999,  // невичерпний запас
        premiumCoin: 0,
      },
    });

    // ── 3. NPC-компанія з фіксованим ID ──────────────────────────────────────
    const company = await prisma.company.upsert({
      where : { id: NPC_COMPANY_ID },
      update: {},
      create: {
        id     : NPC_COMPANY_ID,
        ownerId: NPC_USER_ID,
        name   : "Преміальний постачальник",
        slogan : "Якість без компромісів · Гарантована наявність",
        rating : 999,
      },
    });

    return NextResponse.json({
      ok: true,
      created: { userId: user.id, companyId: company.id },
      note: "Тепер запусти tick — NPC-пропозиції з'являться автоматично",
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
