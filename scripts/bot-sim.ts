/**
 * Bot Simulation — 10 bots with different strategies over 50 ticks.
 * Run: npx tsx scripts/bot-sim.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { TickEngine } from '../src/engine/TickEngine';

const prisma = new PrismaClient();
const TICKS  = 50;
const INITIAL_CASH = 2_000_000; // UAH, generous starting capital

// ── Bot strategy definitions ───────────────────────────────────────────────
const BOT_DEFINITIONS = [
  { key: 'bread',     username: 'bot_bread',     company: 'Хлібобулочний завод «Колос»',    strategy: 'Хлібо-бурячна переробка',  recipe: 'Bread Baking',          entType: 'FOOD_PROCESSING' as const },
  { key: 'oil',      username: 'bot_oil',       company: 'Олійня «Сонях»',                strategy: 'Соняшникова олія',           recipe: 'Sunflower Oil Pressing', entType: 'FOOD_PROCESSING' as const },
  { key: 'dairy',    username: 'bot_dairy',     company: 'Молочний завод «Росинка»',       strategy: 'Молочна переробка',          recipe: 'Dairy Pasteurisation',   entType: 'FOOD_PROCESSING' as const },
  { key: 'pasta',    username: 'bot_pasta',     company: 'Макаронна фабрика «Золото»',     strategy: 'Макаронне виробництво',      recipe: 'Pasta Production',       entType: 'FOOD_PROCESSING' as const },
  { key: 'sugar',    username: 'bot_sugar',     company: 'Цукровий завод «Кристал»',       strategy: 'Цукровий рафінад',           recipe: 'Sugar Refining',         entType: 'FOOD_PROCESSING' as const },
  { key: 'wheat',    username: 'bot_wheat',     company: 'Млин «Борошно плюс»',            strategy: 'Помол пшениці',              recipe: 'Wheat Milling',          entType: 'FOOD_PROCESSING' as const },
  { key: 'steel',    username: 'bot_steel',     company: 'Металургійний завод «Залізо»',   strategy: 'Виплавка сталі',             recipe: 'Steel Smelting',         entType: 'TEXTILE_FACTORY' as const },
  { key: 'steelprod',username: 'bot_steelprod', company: 'Металовироби «Арматура»',        strategy: 'Вироби зі сталі',            recipe: 'Steel Product Fabrication', entType: 'TEXTILE_FACTORY' as const },
  { key: 'furniture',username: 'bot_furniture', company: 'Меблева фабрика «Дубок»',        strategy: 'Меблеве виробництво',        recipe: 'Furniture Manufacturing',entType: 'TEXTILE_FACTORY' as const },
  { key: 'sawmill',  username: 'bot_sawmill',   company: 'Лісопилка «Деревина»',           strategy: 'Деревообробка',              recipe: 'Sawmilling',             entType: 'TEXTILE_FACTORY' as const },
];

interface BotState {
  playerId:     string;
  username:     string;
  strategy:     string;
  enterpriseId: string;
  workshopId:   string;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function log(msg: string) { console.log(`  ${msg}`); }

async function getOrCreatePlayer(username: string, company: string): Promise<string> {
  const existing = await prisma.player.findUnique({ where: { username }, select: { id: true } });
  if (existing) return existing.id;

  const hash = await bcrypt.hash('BotPass123!', 10);
  const player = await prisma.player.create({
    data: {
      email:        `${username}@bot.uae`,
      username,
      passwordHash: hash,
      companyName:  company,
      cashBalance:  INITIAL_CASH,
    },
    select: { id: true },
  });
  return player.id;
}

async function setupBot(def: typeof BOT_DEFINITIONS[0], plots: Array<{ id: string; cityId: string; purchasePriceUah: string }>, plotIdx: number): Promise<BotState> {
  const playerId = await getOrCreatePlayer(def.username, def.company);

  // Check if already set up
  const existingEnt = await prisma.enterprise.findFirst({
    where: { playerId },
    select: { id: true, workshops: { select: { id: true } } },
  });
  if (existingEnt && existingEnt.workshops.length > 0) {
    return { playerId, username: def.username, strategy: def.strategy, enterpriseId: existingEnt.id, workshopId: existingEnt.workshops[0].id };
  }

  const plot = plots[plotIdx];
  if (!plot) throw new Error(`No land plot available for bot ${def.username}`);

  // Assign land plot to player
  await prisma.landPlot.update({
    where: { id: plot.id },
    data:  { playerId, status: 'OWNED' },
  });

  // Deduct land price from balance
  const landPrice = Number(plot.purchasePriceUah);
  await prisma.player.update({
    where: { id: playerId },
    data:  { cashBalance: { decrement: Math.min(landPrice, INITIAL_CASH * 0.3) } },
  });

  // Create enterprise (already operational — skip construction for simulation)
  const enterprise = await prisma.enterprise.create({
    data: {
      playerId,
      landPlotId:       plot.id,
      type:             def.entType,
      name:             def.company,
      footprintM2:      400,
      totalFloorAreaM2: 800,
      usedFloorAreaM2:  400,
      isOperational:    true,
      constructedAt:    new Date(),
      basePowerKwhPerTick: 10,
    },
  });

  // Create workshop
  const workshop = await prisma.workshop.create({
    data: {
      enterpriseId: enterprise.id,
      name:         `Цех ${def.recipe}`,
      footprintM2:  300,
      maxCapacity:  100,
      currentVolume: 80,
      isActive:     true,
    },
  });

  // Find a product to use as equipment catalog reference (any product)
  const anyProduct = await prisma.product.findFirst({ select: { id: true } });
  if (!anyProduct) throw new Error('No products in DB');

  // Install equipment
  await prisma.equipment.create({
    data: {
      workshopId:           workshop.id,
      catalogProductId:     anyProduct.id,
      name:                 `Обладнання для ${def.recipe}`,
      status:               'NEW',
      wearAndTear:          0.0,
      isBroken:             false,
      energyConsumptionKw:  15,
      baseQualityModifier:  1.0,
      marketValueUah:       500_000,
      maintenanceCostUah:   5_000,
    },
  });

  // Find recipe
  const recipe = await prisma.recipe.findFirst({
    where:   { name: def.recipe },
    include: { inputs: { include: { product: true } }, outputs: { include: { product: true } } },
  });
  if (!recipe) throw new Error(`Recipe "${def.recipe}" not found`);

  // Create production order (large targetQuantity — will run for many ticks)
  await prisma.productionOrder.create({
    data: {
      workshopId:        workshop.id,
      recipeId:          recipe.id,
      targetQuantity:    5000,
      completedQuantity: 0,
      status:            'IN_PROGRESS',
      ticksRemaining:    TICKS * 2,
    },
  });

  // Pre-seed inventory: enough inputs for 50 ticks of full production
  for (const input of recipe.inputs) {
    const needed = input.quantityPerUnit * 80 * TICKS * 1.2; // 20% buffer
    await prisma.enterpriseInventory.upsert({
      where:  { enterpriseId_productId: { enterpriseId: enterprise.id, productId: input.productId } },
      create: { enterpriseId: enterprise.id, productId: input.productId, quantity: needed, avgQuality: 7 },
      update: { quantity: needed, avgQuality: 7 },
    });
  }

  // Hire 5 employees
  for (let i = 0; i < 5; i++) {
    await prisma.employee.create({
      data: {
        playerId,
        enterpriseId: enterprise.id,
        firstName:    `Працівник`,
        lastName:     `${i + 1}`,
        profession:      'OPERATOR' as const,
        salaryUah:       18_000,
        mood:            0.8,
        baseEfficiency:  0.85,
        efficiency:      0.85,
      },
    });
  }

  return { playerId, username: def.username, strategy: def.strategy, enterpriseId: enterprise.id, workshopId: workshop.id };
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║           UAeconomy — Bot Simulation (10 bots × 50 тіків)    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // ── Step 1: Setup bots ────────────────────────────────────────────────
  console.log('▶ Ініціалізація ботів...');
  const plots = await prisma.landPlot.findMany({
    where: { status: 'AVAILABLE', playerId: null },
    take: 15,
    select: { id: true, cityId: true, purchasePriceUah: true },
  });
  log(`Доступно ділянок: ${plots.length}`);

  const bots: BotState[] = [];
  for (let i = 0; i < BOT_DEFINITIONS.length; i++) {
    const def = BOT_DEFINITIONS[i];
    try {
      const bot = await setupBot(def, plots, i);
      bots.push(bot);
      log(`✓ ${def.username.padEnd(15)} → ${def.strategy}`);
    } catch (err) {
      log(`✗ ${def.username}: ${(err as Error).message}`);
    }
  }
  console.log(`\n  Всього ботів готово: ${bots.length}/10\n`);

  // ── Step 2: Run 50 ticks ──────────────────────────────────────────────
  console.log('▶ Запускаємо 50 тіків...\n');
  const engine = new TickEngine(prisma);

  const startState = await getSnapshot(bots);

  for (let t = 1; t <= TICKS; t++) {
    const summary = await engine.processNextTick();
    const tick = Number(summary.tickNumber);

    // Renew production orders that completed
    for (const bot of bots) {
      const completedOrder = await prisma.productionOrder.findFirst({
        where: { workshopId: bot.workshopId, status: 'COMPLETED' },
        select: { id: true, recipeId: true },
      });
      if (completedOrder) {
        await prisma.productionOrder.update({
          where: { id: completedOrder.id },
          data:  { status: 'IN_PROGRESS', targetQuantity: 5000, completedQuantity: 0, ticksRemaining: TICKS },
        });
      }
    }

    if (t % 10 === 0) {
      process.stdout.write(`  Тік ${tick.toString().padStart(3)} / ${TICKS} ✓\n`);
    } else {
      process.stdout.write(`  Тік ${tick.toString().padStart(3)} ✓\r`);
    }
  }

  // ── Step 3: Report ────────────────────────────────────────────────────
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                     РЕЗУЛЬТАТИ СИМУЛЯЦІЇ                     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const endState = await getSnapshot(bots);

  console.log('┌─────────────────────────────┬──────────────────┬────────────────────┬──────────────┬────────────────┐');
  console.log('│ Стратегія                   │  Баланс (UAH)    │  Δ Баланс          │  Вироблено   │  Кредит. рейт. │');
  console.log('├─────────────────────────────┼──────────────────┼────────────────────┼──────────────┼────────────────┤');

  for (const bot of bots) {
    const start = startState.get(bot.playerId);
    const end   = endState.get(bot.playerId);
    if (!start || !end) continue;

    const delta    = end.balance - start.balance;
    const deltaStr = (delta >= 0 ? '+' : '') + Math.round(delta).toLocaleString('uk-UA');
    const balStr   = Math.round(end.balance).toLocaleString('uk-UA');

    console.log(
      `│ ${bot.strategy.padEnd(27)} │ ${balStr.padStart(16)} │ ${deltaStr.padStart(18)} │ ${end.produced.toString().padStart(12)} │ ${(end.creditRating ?? '-').toString().padStart(14)} │`
    );
  }

  console.log('└─────────────────────────────┴──────────────────┴────────────────────┴──────────────┴────────────────┘');

  // ── Inventory report ──────────────────────────────────────────────────
  console.log('\n📦 СКЛАДИ ПІСЛЯ 50 ТІКІВ:\n');
  for (const bot of bots) {
    const inv = await prisma.enterpriseInventory.findMany({
      where:   { enterpriseId: bot.enterpriseId, quantity: { gt: 0.01 } },
      include: { product: { select: { nameUa: true } } },
    });
    if (inv.length === 0) continue;
    console.log(`  ${bot.strategy}:`);
    for (const row of inv) {
      console.log(`    • ${row.product.nameUa.padEnd(30)} ${Math.round(Number(row.quantity))} од. (якість ${(Number(row.avgQuality)).toFixed(1)})`);
    }
  }

  // ── Errors summary ────────────────────────────────────────────────────
  const lastTick = await prisma.gameTick.findFirst({ orderBy: { tickNumber: 'desc' }, select: { tickNumber: true } });
  console.log(`\n✅ Симуляцію завершено. Поточний тік: ${lastTick?.tickNumber.toString() ?? 'N/A'}`);
  console.log(`   Ботів успішно: ${bots.length}`);
}

async function getSnapshot(bots: BotState[]) {
  const map = new Map<string, { balance: number; produced: number; creditRating: string | null }>();
  for (const bot of bots) {
    const player = await prisma.player.findUnique({
      where:  { id: bot.playerId },
      select: { cashBalance: true, creditRating: true },
    });
    const orders = await prisma.productionOrder.findMany({
      where:  { workshopId: bot.workshopId },
      select: { completedQuantity: true },
    });
    const produced = orders.reduce((s, o) => s + Number(o.completedQuantity), 0);
    map.set(bot.playerId, {
      balance:      Number(player?.cashBalance ?? 0),
      produced:     Math.round(produced),
      creditRating: player?.creditRating ?? null,
    });
  }
  return map;
}

main()
  .catch(err => { console.error('\n❌ Помилка:', err.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
