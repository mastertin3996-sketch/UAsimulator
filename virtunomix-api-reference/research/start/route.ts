import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pointsForLevel } from "@/lib/research-utils";

// POST /api/research/start
// Body: { enterpriseId, investmentGC, investmentPC? }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const { enterpriseId, investmentGC, investmentPC = 0 } = await req.json() as {
    enterpriseId : string;
    investmentGC : number;
    investmentPC?: number;
  };

  if (!enterpriseId) {
    return NextResponse.json({ error: "enterpriseId обов'язковий" }, { status: 400 });
  }
  if (investmentGC < 0 || investmentPC < 0) {
    return NextResponse.json({ error: "Інвестиції не можуть бути від'ємними" }, { status: 400 });
  }
  if (investmentGC === 0 && investmentPC === 0) {
    return NextResponse.json({ error: "Щоб почати дослідження, введіть хоча б 1 GC або 1 PC/тік" }, { status: 400 });
  }

  const enterprise = await prisma.enterprise.findFirst({
    where  : { id: enterpriseId, company: { ownerId: userId } },
    include: { enterpriseType: { select: { category: true } } },
  });
  if (!enterprise) {
    return NextResponse.json({ error: "Підприємство не знайдено" }, { status: 404 });
  }

  const wallet = await prisma.userWallet.findUnique({ where: { userId } });
  if (investmentGC > 0 && Number(wallet?.gameCash ?? 0) < investmentGC) {
    return NextResponse.json({ error: "Недостатньо GC навіть на один тік" }, { status: 400 });
  }
  if (investmentPC > 0 && Number(wallet?.premiumCoin ?? 0) < investmentPC) {
    return NextResponse.json({ error: "Недостатньо PC навіть на один тік" }, { status: 400 });
  }

  const existing = await prisma.techResearch.findUnique({
    where: { userId_enterpriseId: { userId, enterpriseId } },
  });

  const research = await prisma.techResearch.upsert({
    where  : { userId_enterpriseId: { userId, enterpriseId } },
    create : {
      userId,
      enterpriseId,
      sector           : enterprise.enterpriseType.category,
      currentLevel     : 0,
      researchProgress : 0,
      pointsRequired   : pointsForLevel(0),
      investmentGC,
      investmentPC,
      isActive         : true,
    },
    update : { investmentGC, investmentPC, isActive: true },
  });

  return NextResponse.json({
    research: {
      enterpriseId    : research.enterpriseId,
      currentLevel    : research.currentLevel,
      researchProgress: Number(research.researchProgress),
      pointsRequired  : Number(research.pointsRequired),
      investmentGC    : Number(research.investmentGC),
      investmentPC    : Number(research.investmentPC),
      isActive        : research.isActive,
    },
    created: !existing,
  }, { status: existing ? 200 : 201 });
}
