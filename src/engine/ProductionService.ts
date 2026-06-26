import { PrismaClient } from '@prisma/client';
import { QUALITY_WEIGHTS } from '../constants/economic';
import { EquipmentService } from './EquipmentService';
import { HRService } from './HRService';
import type { ProductionResult } from '../types';
import { clamp, weightedAvgQuality } from '../types';
import type { ResearchDevelopmentService } from './ResearchDevelopmentService';

export class ProductionService {
  private readonly equipmentSvc: EquipmentService;
  private readonly hrSvc: HRService;

  constructor(
    private readonly prisma:    PrismaClient,
    private readonly rdService?: ResearchDevelopmentService,
  ) {
    this.equipmentSvc = new EquipmentService(prisma);
    this.hrSvc        = new HRService(prisma);
  }

  /**
   * Processes all active production orders across all of the player's
   * operational enterprises for one game-day tick.
   *
   * Returns:
   *  - results[]          — per-order outcome
   *  - utilisationMap     — workshopId → 0–1 fraction used (fed to energy + degradation)
   *  - overworkedEntIds   — set of enterprise ids running above designed capacity
   */
  // Seasonal yield multipliers for AGRO_FARM crops
  // season index: 0=Spring(ticks 0-29), 1=Summer(30-59), 2=Autumn(60-89), 3=Winter(90-119)
  private static readonly AGRO_SEASON_MULTS: Record<string, [number, number, number, number]> = {
    'RM-WHEAT':   [1.0, 0.8, 0.15, 0.0],
    'RM-SUNFL':   [0.2, 1.0, 0.75, 0.0],
    'RM-SUGBEET': [0.4, 0.8, 1.0,  0.0],
    'RM-MILK':    [1.0, 0.9, 1.0,  0.75],
  };

  async processProduction(playerId: string, tickNumber?: bigint): Promise<{
    results: ProductionResult[];
    utilisationByWorkshop: Map<string, number>;
    overworkedEnterpriseIds: Set<string>;
  }> {
    const enterprises = await this.prisma.enterprise.findMany({
      where:   { playerId, isOperational: true },
      include: {
        employees: true,
        landPlot: { select: { id: true, soilQuality: true, lastCropSku: true } },
        workshops: {
          where:   { isActive: true },
          include: {
            equipment: true,
            productionOrders: {
              where:   { status: 'IN_PROGRESS' },
              include: {
                recipe: {
                  include: {
                    inputs:  { include: { product: true } },
                    outputs: { include: { product: true } },
                  },
                },
              },
            },
          },
        },
        inventory: true,
      },
    });

    const results:               ProductionResult[] = [];
    const utilisationByWorkshop: Map<string, number> = new Map();
    const overworkedEnterpriseIds: Set<string>        = new Set();

    for (const ent of enterprises) {
      const labourEff  = this.hrSvc.workshopLabourEfficiency(ent.employees);
      const avgMood    = this.hrSvc.avgActiveMood(ent.employees); // 0.0–1.0
      const moodFactor = avgMood * 10; // конвертуємо до 0–10 для формули якості

      for (const ws of ent.workshops) {
        if (ws.productionOrders.length === 0) {
          utilisationByWorkshop.set(ws.id, 0);
          continue;
        }

        const equipFactor  = this.equipmentSvc.workshopEquipmentFactor(ws.equipment);
        const equipQuality = this.equipmentSvc.workshopQualityFactor(ws.equipment); // 0–10

        // Overall efficiency drives both output volume and utilisation rate
        const efficiency   = clamp(labourEff * equipFactor, 0, 1);
        utilisationByWorkshop.set(ws.id, efficiency);

        for (const order of ws.productionOrders) {
          const recipe     = order.recipe;
          const remaining  = order.targetQuantity - order.completedQuantity;
          if (remaining <= 0) continue;

          // Output per tick scaled by efficiency and capped at remaining quantity.
          // AGRO_FARM: base = land footprint × soil quality × season × crop rotation
          let baseCapacity: number;
          if (ent.type === 'AGRO_FARM') {
            const cropSku  = recipe.outputs[0]?.product.sku ?? '';
            const soilMult = ent.landPlot ? ent.landPlot.soilQuality / 7.0 : 1.0;

            // Season: 1 year = 120 ticks, 4 seasons of 30 ticks each
            const season = Math.floor((Number(tickNumber ?? 0n) % 120) / 30);
            const seasonMult = ProductionService.AGRO_SEASON_MULTS[cropSku]?.[season] ?? 1.0;

            // Rotation penalty: same crop as last harvest → −15% yield
            const rotationMult =
              cropSku !== 'RM-MILK' && ent.landPlot?.lastCropSku === cropSku ? 0.85 : 1.0;

            baseCapacity = ws.footprintM2 * soilMult * seasonMult * rotationMult;
          } else {
            baseCapacity = ws.maxCapacity;
          }
          const maxThisTick   = baseCapacity * efficiency;
          const unitsThisTick = Math.min(maxThisTick, remaining);

          if (unitsThisTick < 0.001) {
            // Efficiency so low nothing gets produced
            await this.prisma.productionOrder.update({
              where: { id: order.id },
              data:  { ticksRemaining: Math.max(0, order.ticksRemaining - 1) },
            });
            continue;
          }

          // ── Input material check ──────────────────────────────────────
          const inputsConsumed: Array<{ productId: string; quantity: number }> = [];
          let   inputQualitySum  = 0;
          let   inputQualityWt   = 0;
          let   canProduce       = true;

          for (const input of recipe.inputs) {
            const needed  = input.quantityPerUnit * unitsThisTick;
            const invRow  = ent.inventory.find(i => i.productId === input.productId);
            const onHand  = invRow?.quantity ?? 0;

            if (onHand < needed - 0.001) {
              canProduce = false;
              break;
            }

            inputsConsumed.push({ productId: input.productId, quantity: needed });
            inputQualitySum += (invRow?.avgQuality ?? 5) * needed;
            inputQualityWt  += needed;
          }

          if (!canProduce) continue;

          const inputQualityFactor = inputQualityWt > 0
            ? inputQualitySum / inputQualityWt   // 0–10
            : 5;

          // ── Quality derivation ────────────────────────────────────────
          // quality = w_eq * equipQuality + w_mood * moodFactor + w_input * inputQuality
          //           + rdBonus (HIGH_TECH_AGRO: +1.5 for agro enterprises)
          const rdBonus = this.rdService
            ? await this.rdService.getProductionQualityModifier(playerId, ent.type)
            : 0;
          const outputQuality = clamp(
            QUALITY_WEIGHTS.EQUIPMENT * equipQuality +
            QUALITY_WEIGHTS.MOOD      * moodFactor   +
            QUALITY_WEIGHTS.INPUT     * inputQualityFactor +
            rdBonus,
            0, 10,
          );

          const energyKwh = recipe.powerKwhPerUnit * unitsThisTick;
          const newCompleted = order.completedQuantity + unitsThisTick;
          const nowDone      = newCompleted >= order.targetQuantity - 0.001;

          // ── Deduct inputs from enterprise inventory ───────────────────
          for (const consumed of inputsConsumed) {
            const invRow = ent.inventory.find(i => i.productId === consumed.productId)!;
            const newQty = invRow.quantity - consumed.quantity;
            await this.prisma.enterpriseInventory.update({
              where: { id: invRow.id },
              data:  { quantity: newQty < 0.0001 ? 0 : newQty },
            });
            // keep local cache in sync
            invRow.quantity = newQty;
          }

          // ── Credit outputs to enterprise inventory ────────────────────
          for (const output of recipe.outputs) {
            const produced = output.quantityPerUnit * unitsThisTick;
            const existing = ent.inventory.find(i => i.productId === output.productId);

            if (existing) {
              const newQty = existing.quantity + produced;
              const newAvgQ = weightedAvgQuality([
                { quantity: existing.quantity, quality: existing.avgQuality },
                { quantity: produced,          quality: outputQuality },
              ]);
              await this.prisma.enterpriseInventory.update({
                where: { id: existing.id },
                data:  { quantity: newQty, avgQuality: newAvgQ },
              });
              existing.quantity   = newQty;
              existing.avgQuality = newAvgQ;
            } else {
              const created = await this.prisma.enterpriseInventory.create({
                data: {
                  enterpriseId: ent.id,
                  productId:    output.productId,
                  quantity:     produced,
                  avgQuality:   outputQuality,
                },
              });
              ent.inventory.push(created);
            }
          }

          // ── Update production order ───────────────────────────────────
          await this.prisma.productionOrder.update({
            where: { id: order.id },
            data: {
              completedQuantity: newCompleted,
              ticksRemaining:    Math.max(0, order.ticksRemaining - 1),
              outputQuality,
              status:      nowDone ? 'COMPLETED' : 'IN_PROGRESS',
              completedAt: nowDone ? new Date()  : null,
            },
          });

          // ── AGRO_FARM: update soil quality + rotation tracking ────────
          if (ent.type === 'AGRO_FARM' && ent.landPlot) {
            const cropSku   = recipe.outputs[0]?.product.sku ?? null;
            const isSameCrop = cropSku !== null && cropSku !== 'RM-MILK' && ent.landPlot.lastCropSku === cropSku;
            const delta      = isSameCrop ? -0.05 : +0.02;
            const newQuality = Math.max(1.0, Math.min(10.0, ent.landPlot.soilQuality + delta));
            await this.prisma.landPlot.update({
              where: { id: ent.landPlot.id },
              data:  { soilQuality: newQuality, lastCropSku: cropSku },
            });
            ent.landPlot.soilQuality  = newQuality;
            ent.landPlot.lastCropSku  = cropSku;
          }

          results.push({
            enterpriseId:    ent.id,
            workshopId:      ws.id,
            orderId:         order.id,
            recipeId:        recipe.id,
            unitsProduced:   unitsThisTick,
            outputQuality,
            inputsConsumed,
            energyConsumedKwh: energyKwh,
            completed:       nowDone,
          });
        }

        // Flag overwork: if the workshop is trying to produce above its tick capacity
        if (efficiency > 0.95) overworkedEnterpriseIds.add(ent.id);
      }
    }

    return { results, utilisationByWorkshop, overworkedEnterpriseIds };
  }

  /**
   * Places a new production order on a workshop after validating:
   *  1. Player owns the enterprise containing the workshop
   *  2. City has an operational office
   *  3. Sufficient input inventory exists (not reserved — first-come, first-served)
   *  4. Recipe is compatible with enterprise type
   */
  async createProductionOrder(
    playerId:       string,
    workshopId:     string,
    recipeId:       string,
    targetQuantity: number,
  ): Promise<string> {
    const workshop = await this.prisma.workshop.findUniqueOrThrow({
      where:   { id: workshopId },
      include: { enterprise: { include: { landPlot: true } } },
    });

    if (workshop.enterprise.playerId !== playerId) throw new Error('Not owner');
    if (!workshop.isActive) throw new Error('Workshop is not active');

    const recipe = await this.prisma.recipe.findUniqueOrThrow({
      where:   { id: recipeId },
      include: { inputs: true, outputs: true },
    });

    if (recipe.enterpriseType !== workshop.enterprise.type) {
      throw new Error(`Recipe requires ${recipe.enterpriseType}, not ${workshop.enterprise.type}`);
    }

    // Verify office exists in this city
    const cityId = workshop.enterprise.landPlot.cityId;
    const office = await this.prisma.office.findUnique({
      where: { playerId_cityId: { playerId, cityId } },
    });
    if (!office?.isOperational) {
      throw new Error(`No operational office in city ${cityId}. Establish one first.`);
    }

    // Validate inventory for 1 full run (optimistic — actual consumption is per-tick)
    for (const input of recipe.inputs) {
      const needed = input.quantityPerUnit * targetQuantity;
      const inv    = await this.prisma.enterpriseInventory.findUnique({
        where: { enterpriseId_productId: { enterpriseId: workshop.enterpriseId, productId: input.productId } },
      });
      if ((inv?.quantity ?? 0) < needed) {
        throw new Error(`Insufficient ${input.productId}: need ${needed}, have ${inv?.quantity ?? 0}`);
      }
    }

    const ticksRequired = recipe.ticksToComplete * Math.ceil(targetQuantity / workshop.maxCapacity);

    const order = await this.prisma.productionOrder.create({
      data: {
        workshopId,
        recipeId,
        targetQuantity,
        ticksRemaining: ticksRequired,
        status: 'IN_PROGRESS',
      },
    });

    return order.id;
  }
}
