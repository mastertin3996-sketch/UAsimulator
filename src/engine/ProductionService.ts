import { PrismaClient } from '@prisma/client';
import { QUALITY_WEIGHTS } from '../constants/economic';
import { EquipmentService } from './EquipmentService';
import { HRService } from './HRService';
import { CapacityService } from './CapacityService';
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
    'RM-WHEAT':      [1.0, 0.8, 0.15, 0.0],
    'RM-SUNFL':      [0.2, 1.0, 0.75, 0.0],
    'RM-SUGBEET':    [0.4, 0.8, 1.0,  0.0],
    'RM-CORN':       [0.3, 1.0, 0.80, 0.0],
    'RM-MILK':       [1.0, 0.9, 1.0,  0.75],
    'RM-LIVESTOCK':  [1.0, 1.0, 1.0,  0.80],
    'SF-COMPOST':    [1.0, 1.0, 1.0,  1.00],
  };

  async processProduction(playerId: string, tickNumber?: bigint): Promise<{
    results: ProductionResult[];
    utilisationByWorkshop: Map<string, number>;
    overworkedEnterpriseIds: Set<string>;
  }> {
    // Pre-fetch AG-FERTILIZER product ID for soil boost check (one query, used in inner loop)
    const fertProduct = await this.prisma.product.findFirst({
      where:  { sku: 'AG-FERTILIZER' },
      select: { id: true },
    });

    // Pre-fetch cities affected by active DROUGHT events
    const droughtRows = await this.prisma.macroEvent.findMany({
      where:  { type: 'DROUGHT', status: 'ACTIVE' },
      select: { affectedCityId: true },
    });
    const droughtCities = new Set<string>(droughtRows.map(d => d.affectedCityId).filter(Boolean) as string[]);

    // Pre-fetch EQ-IRRIGATION product ID for drought mitigation + summer bonus
    const irrigationProduct = await this.prisma.product.findFirst({
      where: { sku: 'EQ-IRRIGATION' }, select: { id: true },
    });

    // Pre-fetch SF-COMPOST product ID for organic soil bonus
    const compostProduct = await this.prisma.product.findFirst({
      where: { sku: 'SF-COMPOST' }, select: { id: true },
    });

    // Pre-fetch RM-SUNFL product ID for beehive quality bonus
    const sunflProduct = await this.prisma.product.findFirst({
      where: { sku: 'RM-SUNFL' }, select: { id: true },
    });

    // Pre-fetch players with active ORGANIC_CERT (блокуємо AG-FERTILIZER для органічних ферм)
    const organicCertRows = await this.prisma.license.findMany({
      where:  { type: 'ORGANIC_CERT', status: 'ACTIVE' },
      select: { enterpriseId: true },
    });
    const organicEnterpriseIds = new Set<string>(
      organicCertRows.map(r => r.enterpriseId).filter(Boolean) as string[]
    );

    // Pre-fetch EQ-* product IDs for CapacityService required-equipment checks
    const eqProducts = await this.prisma.product.findMany({
      where:  { sku: { startsWith: 'EQ-' } },
      select: { id: true, sku: true },
    });
    const productIdToSku = new Map<string, string>(eqProducts.map(p => [p.id, p.sku]));

    const enterprises = await this.prisma.enterprise.findMany({
      where:   { playerId, isOperational: true },
      include: {
        employees: true,
        landPlot: { select: { id: true, soilQuality: true, lastCropSku: true, cityId: true, fertilizerTicksLeft: true, pestDamageMult: true, seedQuality: true, cropDiseaseType: true, cropDiseaseSeverity: true } },
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
        farmMachinery: {
          where:  { isOperational: true },
          select: { machineryType: true, durability: true },
        },
        livestockHerds: {
          select: { species: true, headCount: true, health: true },
        },
      },
    });

    const results:               ProductionResult[] = [];
    const utilisationByWorkshop: Map<string, number> = new Map();
    const overworkedEnterpriseIds: Set<string>        = new Set();

    for (const ent of enterprises) {
      const labourEff  = this.hrSvc.workshopLabourEfficiency(ent.employees);
      const avgMood    = this.hrSvc.avgActiveMood(ent.employees); // 0.0–1.0
      const moodFactor = avgMood * 10; // конвертуємо до 0–10 для формули якості

      // Active (non-striking) staff count — shared across all workshops of this enterprise
      const activeStaffCount = ent.employees.filter(e => !e.isOnStrike).length;

      for (const ws of ent.workshops) {
        if (ws.productionOrders.length === 0) {
          utilisationByWorkshop.set(ws.id, 0);
          continue;
        }

        const equipFactor  = this.equipmentSvc.workshopEquipmentFactor(ws.equipment);
        const equipQuality = this.equipmentSvc.workshopQualityFactor(ws.equipment); // 0–10

        // ── Capacity check: staff count, floor area, required equipment ──────
        const operationalEquipSkus = ws.equipment
          .filter(eq => !eq.isBroken && eq.wearAndTear < 1.0)
          .map(eq => productIdToSku.get(eq.catalogProductId) ?? '')
          .filter(Boolean);

        const capacity = CapacityService.compute({
          enterpriseType:           ent.type,
          activeStaffCount,
          workshopAreaM2:           ws.footprintM2,
          installedEquipmentCount:  ws.equipment.filter(eq => !eq.isBroken).length,
          operationalEquipmentSkus: operationalEquipSkus,
        });

        if (!capacity.canProduce) {
          utilisationByWorkshop.set(ws.id, 0);
          continue;
        }

        // Overall efficiency: existing quality/wear factor × new capacity multiplier
        const efficiency = clamp(labourEff * equipFactor * capacity.multiplier, 0, 1);
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

            const season     = Math.floor((Number(tickNumber ?? 0n) % 120) / 30);
            const seasonMult = ProductionService.AGRO_SEASON_MULTS[cropSku]?.[season] ?? 1.0;

            // 3-field crop rotation: WHEAT→SUNFL→SUGBEET→WHEAT
            const OPTIMAL_NEXT: Record<string, string> = {
              'RM-WHEAT': 'RM-SUNFL', 'RM-SUNFL': 'RM-SUGBEET', 'RM-SUGBEET': 'RM-WHEAT', 'RM-CORN': 'RM-WHEAT',
            };
            const FIELD_CROPS = new Set(['RM-WHEAT', 'RM-SUNFL', 'RM-SUGBEET', 'RM-CORN']);
            const lastCrop = ent.landPlot?.lastCropSku;
            let rotationMult = 1.0;
            if (FIELD_CROPS.has(cropSku)) {
              if (lastCrop === cropSku)                                rotationMult = 0.85;
              else if (lastCrop && OPTIMAL_NEXT[lastCrop] === cropSku) rotationMult = 1.15;
            }

            // EQ-IRRIGATION: drought mitigation + summer bonus
            const hasIrrigation = irrigationProduct
              ? ws.equipment.some(eq => eq.catalogProductId === irrigationProduct.id)
              : false;
            const droughtMult = (ent.landPlot && droughtCities.has(ent.landPlot.cityId))
              ? (hasIrrigation ? 0.65 : 0.4)
              : 1.0;
            const irrigationBonus = (hasIrrigation && season === 1) ? 1.10 : 1.0;

            // AGRONOMIST: +8% per agronomist (max 2 give bonus)
            const agronomists    = ent.employees.filter(e => e.profession === 'AGRONOMIST').length;
            const agronomistMult = 1 + Math.min(agronomists, 2) * 0.08;

            // Planting bonus: +20% if field crop order runs in first 5 ticks of spring
            const tickInYear   = Number(tickNumber ?? 0n) % 120;
            const plantingBonus = (FIELD_CROPS.has(cropSku) && tickInYear < 5) ? 1.20 : 1.0;

            // Extra field area bonus (орендоване поле)
            const extraArea     = ent.extraFieldAreaM2 ?? 0;
            const fieldAreaMult = extraArea > 0 ? 1 + (extraArea / (ws.footprintM2 + 1)) * 0.5 : 1.0;

            // Local weather modifier (заморозки/град)
            const localWeatherMod = ent.localWeatherMod ?? 1.0;

            // EQ-TRACTOR: +30% yield if operational tractor is installed
            const hasTractor = ws.equipment.some(eq =>
              (productIdToSku.get(eq.catalogProductId) ?? '') === 'EQ-TRACTOR' && !eq.isBroken && eq.wearAndTear < 1.0
            );
            const tractorBonus = hasTractor ? 1.30 : 1.0;

            // FarmMachinery bonuses: enterprise-level agro machines (Технiка вкладка)
            const MACHINERY_YIELD_BONUS: Record<string, number> = {
              TRACTOR: 0.20, COMBINE_HARVESTER: 0.30, SEEDER: 0.10, SPRAYER: 0.05,
            };
            const machineryMult = 1 + (ent.farmMachinery ?? [])
              .filter(m => m.durability > 0)
              .reduce((sum, m) => sum + (MACHINERY_YIELD_BONUS[m.machineryType] ?? 0), 0);

            // Fertilizer: +20% yield if fertilizerTicksLeft > 0
            const fertBonus = (ent.landPlot?.fertilizerTicksLeft ?? 0) > 0 ? 1.20 : 1.0;

            // Pest damage multiplier
            const pestMult = ent.landPlot?.pestDamageMult ?? 1.0;

            // Seed quality multiplier
            const SEED_MULT: Record<string, number> = { BASIC: 0.75, STANDARD: 1.0, PREMIUM: 1.30 };
            const seedMult = FIELD_CROPS.has(cropSku) ? (SEED_MULT[ent.landPlot?.seedQuality ?? 'STANDARD'] ?? 1.0) : 1.0;

            // Crop disease: знижує врожай на severity × 50%
            const diseaseMult = FIELD_CROPS.has(cropSku) && (ent.landPlot?.cropDiseaseSeverity ?? 0) > 0
              ? Math.max(0.1, 1 - (ent.landPlot?.cropDiseaseSeverity ?? 0) * 0.5)
              : 1.0;

            // Livestock health multiplier (для RM-MILK, SF-MILK, RM-LIVESTOCK, FG-EGGS)
            const LIVESTOCK_SKUS = new Set(['RM-MILK', 'SF-MILK', 'RM-LIVESTOCK', 'FG-EGGS']);
            let livestockMult = 1.0;
            if (LIVESTOCK_SKUS.has(cropSku)) {
              const herds = (ent as any).livestockHerds ?? [];
              livestockMult = herds.length > 0
                ? herds.reduce((s: number, h: { health: number }) => s + h.health, 0) / herds.length
                : 0.0; // Немає стада — немає продукції
            }

            // FG-HONEY gate: потрібен RM-SUNFL в інвентарі (бджоли без нектару не дають мед)
            let honeyGate = 1.0;
            if (cropSku === 'FG-HONEY') {
              const hasSunflower = sunflProduct
                ? ent.inventory.some(i => i.productId === sunflProduct.id && Number(i.quantity) >= 1)
                : false;
              if (!hasSunflower) honeyGate = 0.0;
            }

            baseCapacity = ws.footprintM2 * soilMult * seasonMult * rotationMult * droughtMult * irrigationBonus * agronomistMult * plantingBonus * fieldAreaMult * localWeatherMod * tractorBonus * machineryMult * fertBonus * pestMult * seedMult * diseaseMult * livestockMult * honeyGate;
          } else {
            baseCapacity = ws.maxCapacity;
          }
          const maxThisTick   = baseCapacity * efficiency;
          const volumeCap     = ws.currentVolume > 0 ? ws.currentVolume : Infinity;
          const unitsThisTick = Math.min(maxThisTick, volumeCap, remaining);

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

          // Beehive bonus: FG-HONEY +15% quality if AGRO_FARM has RM-SUNFL in inventory
          const outputSku = recipe.outputs[0]?.product.sku ?? '';
          let beeBonus = 0;
          if (outputSku === 'FG-HONEY' && ent.type === 'AGRO_FARM' && sunflProduct) {
            const hasSunfl = ent.inventory.some(i => i.productId === sunflProduct.id && Number(i.quantity) > 0.001);
            if (hasSunfl) beeBonus = 1.5; // +1.5 on 0-10 scale ≈ +15%
          }

          const outputQuality = clamp(
            QUALITY_WEIGHTS.EQUIPMENT * equipQuality +
            QUALITY_WEIGHTS.MOOD      * moodFactor   +
            QUALITY_WEIGHTS.INPUT     * inputQualityFactor +
            rdBonus + beeBonus,
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

          // ── Credit outputs ────────────────────────────────────────────
          // Field crops accumulate for manual harvest; other outputs go directly to inventory
          const FIELD_CROP_SKUS = new Set(['RM-WHEAT', 'RM-SUNFL', 'RM-SUGBEET', 'RM-CORN']);
          const isFieldCrop = ent.type === 'AGRO_FARM' && recipe.outputs.some(o => FIELD_CROP_SKUS.has(o.product.sku));

          if (isFieldCrop) {
            const produced = recipe.outputs.reduce((s, o) => s + o.quantityPerUnit * unitsThisTick, 0);
            await this.prisma.workshop.update({
              where: { id: ws.id },
              data:  { harvestAccumulated: { increment: produced } },
            });
          } else {
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
            const cropSku    = recipe.outputs[0]?.product.sku ?? null;
            const isSameCrop = cropSku !== null && cropSku !== 'RM-MILK' && ent.landPlot.lastCropSku === cropSku;
            let   delta      = isSameCrop ? -0.05 : +0.02;

            // AG-FERTILIZER: consume 1 kg → +0.5 soil quality this tick
            // Заблоковано для ORGANIC_CERT ферм — лише SF-COMPOST дозволено
            const isOrganic = organicEnterpriseIds.has(ent.id);
            if (!isOrganic && fertProduct) {
              const fertInv = ent.inventory.find(i => i.productId === fertProduct.id);
              if (fertInv && fertInv.quantity >= 1) {
                delta += 0.5;
                await this.prisma.enterpriseInventory.update({
                  where: { id: fertInv.id },
                  data:  { quantity: { decrement: 1 } },
                });
                fertInv.quantity -= 1;
              }
            }
            // SF-COMPOST (organic): consume 1 kg → +0.3 soil quality this tick
            if (compostProduct) {
              const compostInv = ent.inventory.find(i => i.productId === compostProduct.id);
              if (compostInv && compostInv.quantity >= 1) {
                delta += 0.3;
                await this.prisma.enterpriseInventory.update({
                  where: { id: compostInv.id },
                  data:  { quantity: { decrement: 1 } },
                });
                compostInv.quantity -= 1;
              }
            }

            const newQuality = Math.max(1.0, Math.min(10.0, ent.landPlot.soilQuality + delta));
            await this.prisma.landPlot.update({
              where: { id: ent.landPlot.id },
              data:  { soilQuality: newQuality, lastCropSku: cropSku },
            });
            ent.landPlot.soilQuality = newQuality;
            ent.landPlot.lastCropSku = cropSku;
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
