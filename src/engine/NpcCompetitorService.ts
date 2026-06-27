/**
 * NpcCompetitorService — управляє NPC-конкурентами на ринку.
 *
 * NPC-конкуренти — це Player-акаунти з isNpcSeller=true, що виставляють
 * ордери продажу на готову продукцію, реагуючи на ринкові ціни гравців.
 * Вони не мають реальних підприємств: "виробляють" через прямий upsert
 * в MarketOrder раз на 3 тіки.
 *
 * Конкуренти:
 *   npc_agro   — аграрний сектор (FG-WHEAT-FLOUR, FG-CORN-OIL)
 *   npc_food   — харчова промисловість (FG-BREAD, FG-DAIRY-MILK)
 *   npc_retail — роздрібна торгівля (FG-TIMBER, FG-STEEL-BAR)
 */

import { PrismaClient } from '@prisma/client';

interface NpcBot {
  username:   string;
  company:    string;
  skus:       string[];
  baseQty:    number;
  priceMult:  number; // initial price = referencePrice × priceMult
}

const NPC_BOTS: NpcBot[] = [
  {
    username:  'npc_agro',
    company:   'АгроЮніон ТОВ',
    skus:      ['FG-WHEAT-FLOUR', 'FG-CORN-OIL', 'FG-SUNFLOWER-OIL'],
    baseQty:   500,
    priceMult: 1.05,
  },
  {
    username:  'npc_food',
    company:   'УкрПродукт АТ',
    skus:      ['FG-BREAD', 'FG-DAIRY-MILK', 'FG-PASTA'],
    baseQty:   400,
    priceMult: 1.08,
  },
  {
    username:  'npc_retail',
    company:   'ТехноТрейд ПП',
    skus:      ['FG-TIMBER', 'FG-STEEL-BAR', 'FG-MEAT'],
    baseQty:   300,
    priceMult: 1.10,
  },
];

const ORDER_LIFETIME_DAYS = 90; // days until order expires

export class NpcCompetitorService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Ensure NPC competitor Player accounts exist in DB. Called from seed or first tick. */
  async ensureBotsExist(): Promise<void> {
    for (const bot of NPC_BOTS) {
      await this.prisma.player.upsert({
        where:  { username: bot.username },
        create: {
          email:        `${bot.username}@npc.game`,
          username:     bot.username,
          passwordHash: 'npc-no-login',
          companyName:  bot.company,
          isNpcSeller:  true,
          cashBalance:  10_000_000,
        },
        update: {},
      });
    }
  }

  /**
   * Main tick method. Called every 3 ticks from TickEngine.
   * For each NPC bot:
   *  1. Loads current open orders
   *  2. Adjusts prices based on fill rate (demand signal)
   *  3. Replenishes low orders
   *  4. Reacts to player prices (undercuts if player is cheaper)
   */
  async tick(tickNumber: bigint): Promise<void> {
    for (const bot of NPC_BOTS) {
      await this.processBot(bot, tickNumber).catch(e =>
        console.error(`[NpcCompetitor] ${bot.username} failed:`, e)
      );
    }
  }

  private async processBot(bot: NpcBot, tickNumber: bigint): Promise<void> {
    const player = await this.prisma.player.findUnique({
      where:  { username: bot.username },
      select: { id: true },
    });
    if (!player) return;

    const expiresAt = new Date(Date.now() + ORDER_LIFETIME_DAYS * 24 * 60 * 60 * 1000);

    for (const sku of bot.skus) {
      const product = await this.prisma.product.findFirst({
        where:  { sku },
        select: { id: true },
      });
      if (!product) continue;

      // Reference price from NpcDemand
      const demand = await this.prisma.npcDemand.findFirst({
        where:  { productId: product.id },
        select: { referencePrice: true },
      });
      const refPrice = demand?.referencePrice ? Number(demand.referencePrice) : null;
      if (!refPrice) continue;

      // Lowest active player price for this product (not our own, not other NPCs)
      const playerOrder = await this.prisma.marketOrder.findFirst({
        where: {
          productId: product.id,
          type:      'SELL',
          status:    { in: ['OPEN', 'PARTIALLY_FILLED'] },
          player:    { isNpcSeller: false },
        },
        orderBy: { pricePerUnit: 'asc' },
        select:  { pricePerUnit: true },
      });

      // Check our own active order
      const ownOrder = await this.prisma.marketOrder.findFirst({
        where: {
          playerId:  player.id,
          productId: product.id,
          type:      'SELL',
          status:    { in: ['OPEN', 'PARTIALLY_FILLED'] },
        },
        select: { id: true, pricePerUnit: true, quantityTotal: true, quantityFilled: true },
      });

      // Determine target price
      let targetPrice = refPrice * bot.priceMult;

      if (playerOrder) {
        const pp = Number(playerOrder.pricePerUnit);
        // If player is significantly cheaper (>5%), NPC undercuts by 2%
        if (pp < targetPrice * 0.95) {
          targetPrice = pp * 0.98;
        }
      }

      // Clamp: never below 70% of refPrice, never above 150%
      targetPrice = Math.max(refPrice * 0.70, Math.min(refPrice * 1.50, targetPrice));
      targetPrice = Math.round(targetPrice * 100) / 100;

      if (ownOrder) {
        const fillRate = ownOrder.quantityFilled / ownOrder.quantityTotal;
        const remaining = ownOrder.quantityTotal - ownOrder.quantityFilled;

        // Adjust price based on demand signal
        const currentPrice = Number(ownOrder.pricePerUnit);
        let newPrice = currentPrice;
        if (fillRate > 0.70) newPrice = +(currentPrice * 1.05).toFixed(2);  // selling fast → raise
        if (fillRate < 0.10) newPrice = +(currentPrice * 0.97).toFixed(2);  // slow → lower
        newPrice = Math.max(refPrice * 0.70, Math.min(refPrice * 1.50, newPrice));
        newPrice = Math.round(newPrice * 100) / 100;

        // Replenish if < 30% remaining
        if (remaining < ownOrder.quantityTotal * 0.30) {
          await this.prisma.marketOrder.update({
            where: { id: ownOrder.id },
            data: {
              quantityTotal: ownOrder.quantityTotal + bot.baseQty,
              pricePerUnit:  newPrice,
              expiresAt,
            },
          });
        } else if (Math.abs(newPrice - currentPrice) > 0.01) {
          // Only update price if it changed meaningfully
          await this.prisma.marketOrder.update({
            where: { id: ownOrder.id },
            data:  { pricePerUnit: newPrice, expiresAt },
          });
        }
      } else {
        // Create fresh order
        await this.prisma.marketOrder.create({
          data: {
            playerId:      player.id,
            productId:     product.id,
            type:          'SELL',
            status:        'OPEN',
            resourceType:  'PRODUCT',
            pricePerUnit:  targetPrice,
            quantityTotal: bot.baseQty,
            quantityFilled: 0,
            quality:       6.5, // decent default quality
            expiresAt,
          },
        });
      }
    }
  }

  /** Returns NPC competitor market activity for the intelligence/dashboard view. */
  async getCompetitorStats(): Promise<{
    username: string; company: string;
    activeOrders: number; totalStock: number; avgPrice: number;
  }[]> {
    const results = [];
    for (const bot of NPC_BOTS) {
      const player = await this.prisma.player.findUnique({
        where:  { username: bot.username },
        select: { id: true, companyName: true },
      });
      if (!player) continue;

      const orders = await this.prisma.marketOrder.findMany({
        where:  { playerId: player.id, status: { in: ['OPEN', 'PARTIALLY_FILLED'] } },
        select: { quantityTotal: true, quantityFilled: true, pricePerUnit: true },
      });

      const activeOrders = orders.length;
      const totalStock   = orders.reduce((s, o) => s + (o.quantityTotal - o.quantityFilled), 0);
      const avgPrice     = orders.length
        ? orders.reduce((s, o) => s + Number(o.pricePerUnit), 0) / orders.length
        : 0;

      results.push({ username: bot.username, company: player.companyName, activeOrders, totalStock, avgPrice });
    }
    return results;
  }
}
