import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TAX } from "@/lib/tax-config";

// ─── GET /api/finances/taxes ──────────────────────────────────────────────────
// Returns the full tax picture for the authenticated player's company:
//   • corporateTax  — rate, interval, current-period projection, history
//   • importDuty    — rate, recent duty payments
//   • cityBudgets   — how city budgets are growing and boosting NPC wealth
//   • recentEvents  — last 20 TaxRecord entries

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const company = await prisma.company.findFirst({
    where  : { ownerId: session.user.id },
    select : {
      id      : true,
      taxState: true,
      owner   : { select: { wallet: { select: { gameCash: true } } } },
    },
  });
  if (!company) return NextResponse.json({ error: "No company" }, { status: 404 });

  // ── Current tick number ────────────────────────────────────────────────────
  const lastTick = await prisma.gameTick.findFirst({
    where  : { status: "DONE" },
    orderBy: { tickNumber: "desc" },
    select : { tickNumber: true },
  });
  const currentTick = lastTick?.tickNumber ?? 0;

  // ── Corporate tax state ────────────────────────────────────────────────────
  const taxState         = company.taxState;
  const lastTaxedTick    = taxState?.lastTaxedTick    ?? 0;
  const balanceAtLastTax = Number(taxState?.balanceAtLastTax ?? 0);
  const totalTaxPaid     = Number(taxState?.totalTaxPaid     ?? 0);
  const totalDutyPaid    = Number(taxState?.totalDutyPaid    ?? 0);

  const currentBalance   = Number(company.owner.wallet?.gameCash ?? 0);
  const netGrowthNow     = Math.max(0, currentBalance - balanceAtLastTax);
  const estimatedTax     = netGrowthNow * TAX.CORPORATE_RATE;

  const ticksInPeriod    = currentTick - lastTaxedTick;
  const ticksUntilTax    = TAX.CORPORATE_INTERVAL - (currentTick % TAX.CORPORATE_INTERVAL);

  // ── Recent tax events (last 30) ────────────────────────────────────────────
  const recentEvents = await prisma.taxRecord.findMany({
    where  : { companyId: company.id },
    orderBy: { createdAt: "desc" },
    take   : 30,
    include: {
      tick: { select: { tickNumber: true } },
    },
  });

  // ── Tax period history — last 10 corporate tax payments ───────────────────
  const corpTaxHistory = recentEvents
    .filter((e) => e.type === "CORPORATE_TAX")
    .map((e) => ({
      id         : e.id,
      amount     : Number(e.amount),
      baseAmount : Number(e.baseAmount),
      rate       : Number(e.rate),
      tickNumber : e.tick.tickNumber,
      description: e.description,
      createdAt  : e.createdAt,
    }));

  // ── Import duty events ─────────────────────────────────────────────────────
  const dutyHistory = recentEvents
    .filter((e) => e.type === "IMPORT_DUTY")
    .map((e) => ({
      id         : e.id,
      amount     : Number(e.amount),
      baseAmount : Number(e.baseAmount),
      rate       : Number(e.rate),
      tickNumber : e.tick.tickNumber,
      description: e.description,
      cityId     : e.cityId,
      createdAt  : e.createdAt,
    }));

  // ── City budgets (all cities, sorted by balance) ───────────────────────────
  const cityBudgets = await prisma.cityBudget.findMany({
    orderBy: { totalCollected: "desc" },
    take   : 20,
    include: {
      city: { select: { name: true, population: true, wealthIndex: true } },
    },
  });

  const cityBudgetRows = cityBudgets.map((b) => ({
    cityId        : b.cityId,
    cityName      : b.city.name,
    population    : b.city.population,
    wealthIndex   : Number(b.city.wealthIndex),
    balance       : Number(b.balance),
    totalCollected: Number(b.totalCollected),
  }));

  // ── Aggregated per-tick chart data for duty (last 20 ticks) ───────────────
  const dutyByTick = new Map<number, number>();
  for (const d of dutyHistory) {
    dutyByTick.set(d.tickNumber, (dutyByTick.get(d.tickNumber) ?? 0) + d.amount);
  }

  return NextResponse.json({
    config: {
      corporateRate    : TAX.CORPORATE_RATE,
      dutyRate         : TAX.DUTY_RATE,
      corporateInterval: TAX.CORPORATE_INTERVAL,
    },
    corporateTax: {
      lastTaxedTick,
      ticksInPeriod,
      ticksUntilNextTax: ticksUntilTax,
      balanceAtLastTax,
      currentBalance,
      netGrowthThisPeriod: netGrowthNow,
      estimatedTax,
      totalTaxPaid,
      history: corpTaxHistory,
    },
    importDuty: {
      totalDutyPaid,
      history: dutyHistory,
      byTick : Object.fromEntries(dutyByTick),
    },
    cityBudgets: cityBudgetRows,
  });
}
