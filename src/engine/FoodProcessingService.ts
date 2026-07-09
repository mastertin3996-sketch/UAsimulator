import { PrismaClient } from '@prisma/client';

/**
 * FoodProcessingService — сигнатурна механіка сфери FOOD_PROCESSING: свіжість/псування.
 *
 * Псувні готові продукти (молочка, хліб, м'ясо) поступово втрачають якість
 * (avgQuality) на складі підприємства, ЯКЩО в підприємства немає робочої
 * промислової холодильної камери (EQ-REFRIGERATOR-IND) — холодовий ланцюг
 * зупиняє псування. Дзеркалить AgroService.processGrainQualityDegradation
 * (пропуск за наявності EQ-SILO). Ніколи не чіпає quantity, лише avgQuality,
 * з жорсткою підлогою — тож механіка адитивна й не занулює запаси.
 *
 * WAREHOUSE-підприємства з робочим EQ-CLIMATE/EQ-COLDROOM також зупиняють
 * псування (розширення холодового ланцюга на склади — Wave 3).
 */
export class FoodProcessingService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Готові продукти, що псуються без холоду. */
  static readonly PERISHABLE_SKUS = new Set<string>([
    'FG-MILK', 'FG-YOGURT', 'FG-SOURCREAM', 'FG-CHEESE', 'FG-BUTTER', 'FG-CONDENSED-MILK',
    'FG-BREAD', 'FG-CAKE', 'FG-COOKIES',
    'FG-MEAT', 'FG-SAUSAGE', 'FG-BEEF', 'FG-PORK', 'FG-CHICKEN', 'FG-DUMPLINGS',
  ]);

  /** SKU обладнання, що утворює холодовий ланцюг і зупиняє псування. */
  static readonly COLD_CHAIN_SKUS = new Set<string>([
    'EQ-REFRIGERATOR-IND', // FOOD_PROCESSING
    'EQ-CLIMATE', 'EQ-COLDROOM', // WAREHOUSE (Wave 3)
  ]);

  /** Втрата якості за тік для псувних без холоду. */
  static readonly DECAY_PER_TICK = 0.04;
  /** Нижня межа якості — псування ніколи не опускає нижче. */
  static readonly QUALITY_FLOOR = 3.0;
  /** Поріг попередження — сповіщення надсилається один раз при перетині зверху вниз. */
  static readonly WARN_QUALITY_THRESHOLD = 6.0;

  /**
   * Знижує avgQuality псувних запасів на підприємствах FOOD_PROCESSING та WAREHOUSE
   * без робочого холодового ланцюга. Один батч-запит на оновлення. Разово сповіщає
   * гравця, коли якість вперше перетинає WARN_QUALITY_THRESHOLD (аналог EQUIPMENT_BROKEN
   * у TickEngine — сповіщення на перехід стану, а не на кожен тік).
   */
  async processPerishability(): Promise<void> {
    const enterprises = await this.prisma.enterprise.findMany({
      where: {
        type: { in: ['FOOD_PROCESSING', 'WAREHOUSE'] },
        isOperational: true, isSeized: false,
      },
      select: {
        id: true, name: true, playerId: true,
        workshops: { select: { equipment: { select: { isBroken: true, wearAndTear: true, catalogProduct: { select: { sku: true } } } } } },
        inventory: { select: { id: true, avgQuality: true, product: { select: { sku: true } } } },
      },
    });

    const updates: { id: string; avgQuality: number }[] = [];
    const warnedByPlayer = new Map<string, Set<string>>(); // playerId → set of enterprise names newly crossing the threshold

    for (const ent of enterprises) {
      // Холодовий ланцюг: хоч одна робоча одиниця з COLD_CHAIN_SKUS (за catalogProduct.sku — надійно).
      const hasColdChain = ent.workshops.some(w =>
        w.equipment.some(eq =>
          !eq.isBroken && eq.wearAndTear < 1.0 &&
          FoodProcessingService.COLD_CHAIN_SKUS.has(eq.catalogProduct.sku),
        ),
      );
      if (hasColdChain) continue;

      for (const inv of ent.inventory) {
        if (!FoodProcessingService.PERISHABLE_SKUS.has(inv.product.sku)) continue;
        if (inv.avgQuality <= FoodProcessingService.QUALITY_FLOOR) continue;
        const newQuality = Math.max(
          FoodProcessingService.QUALITY_FLOOR,
          inv.avgQuality - FoodProcessingService.DECAY_PER_TICK,
        );
        updates.push({ id: inv.id, avgQuality: newQuality });

        if (inv.avgQuality > FoodProcessingService.WARN_QUALITY_THRESHOLD &&
            newQuality <= FoodProcessingService.WARN_QUALITY_THRESHOLD) {
          if (!warnedByPlayer.has(ent.playerId)) warnedByPlayer.set(ent.playerId, new Set());
          warnedByPlayer.get(ent.playerId)!.add(ent.name);
        }
      }
    }

    if (updates.length > 0) {
      await this.prisma.$transaction(
        updates.map(u => this.prisma.enterpriseInventory.update({
          where: { id: u.id }, data: { avgQuality: u.avgQuality },
        })),
      );
    }

    if (warnedByPlayer.size > 0) {
      await this.prisma.notification.createMany({
        data: Array.from(warnedByPlayer.entries()).map(([playerId, names]) => ({
          playerId,
          type:  'PERISHABLE_QUALITY_WARN',
          title: 'Товар псується без охолодження',
          body:  `${Array.from(names).join(', ')}: якість псувних товарів опустилась нижче ${FoodProcessingService.WARN_QUALITY_THRESHOLD}/10. Встановіть холодильне обладнання (EQ-REFRIGERATOR-IND / EQ-CLIMATE / EQ-COLDROOM), щоб зупинити псування.`,
          entityId: null,
        })),
      }).catch(e => console.error('[FoodProcessingService] notification failed:', e));
    }
  }
}
