/**
 * CompanyValuationService — оцінка вартості компанії, управління акціонерними
 * активами та виконання угод злиття/поглинання (M&A).
 *
 * ── Методологія оцінки (dual approach) ───────────────────────────────────────
 *
 *   Asset-Based (30% ваги):
 *     • Земля:      Σ LandPlot.purchasePriceUah × City.landPriceCoeff  (OWNED)
 *                  + Σ monthlyLeaseCostUah × 24  (NPV орендованих ділянок = 2 роки)
 *     • Обладнання: Σ Equipment.marketValueUah × (1 − wearAndTear)  (не зламане)
 *     • Готівка:    Player.cashBalance + Player.balanceUsd × FxRate
 *     • Інвентар:   Σ EnterpriseInventory.quantity × avg_market_price (SELL orders)
 *
 *   Income-Based / EBITDA Multiplier (70% ваги):
 *     • Середнє EBITDA = avg(revenueUah − opexUah) за останні 4 DailySnapshot-и
 *     • Річна EBITDA   = середнє × SNAPSHOTS_PER_YEAR (12)
 *     • Мультиплікатор = 3.0–5.0× залежно від ComplianceScore:
 *         ≥ 0.90 → 5.0 (premium),  ≥ 0.75 → 4.5,  ≥ 0.60 → 4.0,
 *         ≥ 0.45 → 3.5 (mid),      < 0.45 → 3.0 (distressed)
 *
 *   FINAL: Valuation = assetValue × 0.30 + ebitdaValue × 0.70
 *
 * ── M&A Pipeline ──────────────────────────────────────────────────────────────
 *
 *   listProjectForSale(playerId, enterpriseId | null, minPriceUah, tick)
 *     → Перевірки власності, відсутності заморозок і застав;
 *       створює MaDeal (PENDING), встановлює Player.isListedForSale.
 *
 *   executeAcquisition(buyerId, dealId, tick)
 *     → Serializable-транзакція:
 *       1. Перевірка балансу покупця
 *       2. Перевірка наявності Office у місті (для продажу підприємства)
 *       3. Переведення власності: Enterprise + LandPlot + Employees + Warehouse
 *          (Workshops / Equipment — без прямого playerId, переходять автоматично)
 *       4. Для повного buyout: всі активи продавця → покупець
 *       5. FinancialTransaction: MA_ACQUISITION_COST / MA_SALE_REVENUE
 *       6. MaDeal.status → COMPLETED
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

// ── Valuation константи ───────────────────────────────────────────────────────
const ASSET_WEIGHT         = 0.30;
const INCOME_WEIGHT        = 0.70;
const SNAPSHOTS_FOR_EBITDA = 4;             // останні 4 снапшоти
const SNAPSHOTS_PER_YEAR   = 12;            // кожні 24 тіки ≈ місяць, 12/рік
const LEASE_NPV_MONTHS     = 24;            // NPV для орендованих ділянок = 2 роки
const FX_RATE_ID           = 'fx-rate-singleton';

// EBITDA мультиплікатори за ComplianceScore (українські ринкові реалії 2026)
function ebitdaMultiplier(score: number): number {
  if (score >= 0.90) return 5.0;
  if (score >= 0.75) return 4.5;
  if (score >= 0.60) return 4.0;
  if (score >= 0.45) return 3.5;
  return 3.0;
}

// ── M&A константи ────────────────────────────────────────────────────────────
const MIN_DEAL_AMOUNT_UAH = new Decimal('100000');  // мін. сума угоди ₴100 000

// ── Типи результатів ──────────────────────────────────────────────────────────

export interface ValuationBreakdown {
  playerId:        string;
  totalValuation:  Decimal;
  asset: {
    landValue:       Decimal;
    equipmentValue:  Decimal;
    cashValue:       Decimal;
    inventoryValue:  Decimal;
    total:           Decimal;
  };
  income: {
    avgWeeklyEbitda:  Decimal;
    annualEbitda:     Decimal;
    multiplier:       number;
    complianceScore:  number;
    total:            Decimal;
  };
}

export interface AcquisitionResult {
  dealId:              string;
  buyerId:             string;
  sellerId:            string;
  amountUah:           Decimal;
  transferredAssets: {
    enterprises:  number;
    employees:    number;
    landPlots:    number;
    warehouses:   number;
  };
  isFullCompanyBuyout: boolean;
}

// ═════════════════════════════════════════════════════════════════════════════

export class CompanyValuationService {
  constructor(private readonly db: PrismaClient) {}

  // ══════════════════════════════════════════════════════════════════════════
  // ОЦІНКА КОМПАНІЇ
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Обчислює справедливу ринкову вартість компанії і зберігає в Player.companyValuationUah.
   * Повертає детальний breakdown для UI/API.
   */
  async calculateCompanyValuation(playerId: string): Promise<ValuationBreakdown> {
    const breakdown = await this.computeBreakdown(playerId);

    // Зберігаємо результат
    await this.db.player.update({
      where: { id: playerId },
      data:  { companyValuationUah: breakdown.totalValuation },
    });

    return breakdown;
  }

  /** Повертає breakdown без запису в БД (для preview/API). */
  async getValuationBreakdown(playerId: string): Promise<ValuationBreakdown> {
    return this.computeBreakdown(playerId);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ВИСТАВЛЕННЯ НА ПРОДАЖ
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Виставляє підприємство або всю компанію на продаж.
   *
   * @param targetEnterpriseId — null = продаж усієї компанії
   * @param minPriceUah        — мінімальна сума угоди (UAH)
   */
  async listProjectForSale(
    playerId:           string,
    targetEnterpriseId: string | null,
    minPriceUah:        number,
    currentTick:        bigint,
  ): Promise<{ dealId: string }> {
    const minPrice = new Decimal(minPriceUah.toFixed(2));
    if (minPrice.lessThan(MIN_DEAL_AMOUNT_UAH)) {
      throw new Error(
        `Мінімальна ціна угоди — ₴${MIN_DEAL_AMOUNT_UAH.toFixed(0)}. ` +
        `Отримано: ₴${minPrice.toFixed(0)}.`,
      );
    }

    if (targetEnterpriseId) {
      // ── Продаж конкретного підприємства ───────────────────────────────
      const enterprise = await this.db.enterprise.findUniqueOrThrow({
        where:   { id: targetEnterpriseId },
        include: { collateralLoans: { where: { collateralReleased: false } } },
      });

      if (enterprise.playerId !== playerId) {
        throw new Error('Підприємство не належить цьому гравцю.');
      }
      if (enterprise.type === 'OFFICE') {
        throw new Error(
          'Офіс не може бути проданий окремо. ' +
          'Продайте компанію повністю або виберіть інше підприємство.',
        );
      }
      if (enterprise.isLegallyFrozen) {
        throw new Error(
          `Підприємство «${enterprise.name}» заморожене судовим арестом. ` +
          'Зніміть арест перед продажем.',
        );
      }
      if (enterprise.isFrozenByInspection) {
        throw new Error(
          `Підприємство «${enterprise.name}» заморожене податковою перевіркою.`,
        );
      }
      if (enterprise.collateralLoans.length > 0) {
        throw new Error(
          `Підприємство «${enterprise.name}» є заставою за активним кредитом. ` +
          'Погасіть кредит або звільніть заставу перед продажем.',
        );
      }
    } else {
      // ── Продаж усієї компанії ─────────────────────────────────────────
      const player = await this.db.player.findUniqueOrThrow({
        where: { id: playerId },
        select: { isBankrupt: true, isListedForSale: true },
      });
      if (player.isBankrupt) {
        throw new Error('Банкрут не може виставляти компанію на продаж.');
      }
    }

    // Перевіряємо: не існує вже активного оголошення по тому самому об'єкту
    const existing = await this.db.maDeal.findFirst({
      where: {
        sellerId:           playerId,
        targetEnterpriseId: targetEnterpriseId ?? null,
        status:             'PENDING',
      },
    });
    if (existing) {
      throw new Error(
        `Вже існує активне оголошення про продаж (dealId: ${existing.id}).`,
      );
    }

    const deal = await this.db.$transaction(async tx => {
      const d = await tx.maDeal.create({
        data: {
          sellerId:            playerId,
          targetEnterpriseId:  targetEnterpriseId ?? undefined,
          transactionAmountUah: minPrice,
          status:              'PENDING',
          listedAtTick:        currentTick,
        },
      });

      // Оновлюємо прапор гравця для повного викупу
      if (!targetEnterpriseId) {
        await tx.player.update({
          where: { id: playerId },
          data:  { isListedForSale: true, minimumSalePriceUah: minPrice },
        });
      }

      return d;
    });

    return { dealId: deal.id };
  }

  /** Продавець скасовує оголошення. */
  async cancelListing(playerId: string, dealId: string, currentTick: bigint): Promise<void> {
    const deal = await this.db.maDeal.findUniqueOrThrow({ where: { id: dealId } });

    if (deal.sellerId !== playerId) {
      throw new Error('Лише продавець може скасувати оголошення.');
    }
    if (deal.status !== 'PENDING') {
      throw new Error(`Угода вже у статусі "${deal.status}" і не може бути скасована.`);
    }

    await this.db.$transaction([
      this.db.maDeal.update({
        where: { id: dealId },
        data:  { status: 'CANCELED', canceledAtTick: currentTick },
      }),
      ...(!deal.targetEnterpriseId
        ? [this.db.player.update({
            where: { id: playerId },
            data:  { isListedForSale: false, minimumSalePriceUah: new Decimal(0) },
          })]
        : []),
    ]);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ВИКОНАННЯ УГОДИ M&A
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Виконує угоду купівлі/поглинання у Serializable-транзакції.
   *
   * Суворі перевірки:
   *   1. MaDeal.status = PENDING
   *   2. buyer ≠ seller
   *   3. buyer.cashBalance ≥ deal.transactionAmountUah
   *   4. Для окремого підприємства: покупець має активний Office у місті
   *   5. Об'єкт продажу не заморожений/не застава (re-check)
   *
   * Передача власності (повний перелік):
   *   Enterprise + LandPlot + Employees + Warehouse → playerId = buyerId
   *   Workshops / Equipment — без прямого playerId FK, переходять через Enterprise
   *   Для повного buyout: + AutoContract + HRPolicy + всі вищезазначені × N
   */
  async executeAcquisition(
    buyerId:     string,
    dealId:      string,
    currentTick: bigint,
  ): Promise<AcquisitionResult> {
    // Завантажуємо угоду поза транзакцією для попередніх перевірок
    const deal = await this.db.maDeal.findUniqueOrThrow({ where: { id: dealId } });

    if (deal.status !== 'PENDING') {
      throw new Error(`Угода "${dealId}" вже у статусі "${deal.status}".`);
    }
    if (deal.sellerId === buyerId) {
      throw new Error('Покупець не може збігатися з продавцем.');
    }

    const [buyer, seller] = await Promise.all([
      this.db.player.findUniqueOrThrow({ where: { id: buyerId } }),
      this.db.player.findUniqueOrThrow({ where: { id: deal.sellerId } }),
    ]);

    const dealAmount  = new Decimal(deal.transactionAmountUah.toString());
    const buyerBalance = new Decimal(buyer.cashBalance.toString());

    if (buyerBalance.lessThan(dealAmount)) {
      throw new Error(
        `Недостатньо коштів: потрібно ₴${dealAmount.toFixed(0)}, ` +
        `є ₴${buyerBalance.toFixed(0)}.`,
      );
    }

    const isFullBuyout = !deal.targetEnterpriseId;

    // ── Serializable-транзакція ──────────────────────────────────────────
    const result = await this.db.$transaction(async tx => {
      let entCount = 0;
      let empCount = 0;
      let landCount = 0;
      let whCount   = 0;

      if (isFullBuyout) {
        // ── Повний викуп компанії ────────────────────────────────────────
        const transfers = await this.transferAllAssets(tx, deal.sellerId, buyerId);
        entCount  = transfers.enterprises;
        empCount  = transfers.employees;
        landCount = transfers.landPlots;
        whCount   = transfers.warehouses;

        // Знімаємо прапор продажу з продавця
        await tx.player.update({
          where: { id: deal.sellerId },
          data:  { isListedForSale: false, minimumSalePriceUah: new Decimal(0) },
        });

      } else {
        // ── Продаж окремого підприємства ─────────────────────────────────
        const ent = await tx.enterprise.findUniqueOrThrow({
          where:   { id: deal.targetEnterpriseId! },
          include: {
            landPlot:          { include: { city: true } },
            collateralLoans:   { where: { collateralReleased: false } },
          },
        });

        if (ent.isLegallyFrozen || ent.isFrozenByInspection) {
          throw new Error(`Підприємство «${ent.name}» заморожено — угода скасована.`);
        }
        if (ent.collateralLoans.length > 0) {
          throw new Error(`Підприємство «${ent.name}» є заставою — угода скасована.`);
        }

        // Перевіряємо наявність Office у покупця у цьому місті
        const cityId = ent.landPlot.cityId;
        const buyerOffice = await tx.office.findUnique({
          where: { playerId_cityId: { playerId: buyerId, cityId } },
        });
        if (!buyerOffice || !buyerOffice.isOperational) {
          throw new Error(
            `OfficeRequiredException: покупець не має активного офісу у місті ` +
            `"${ent.landPlot.city.name}". ` +
            'Відкрийте офіс у цьому місті, щоб поглинути інфраструктуру.',
          );
        }

        const transfers = await this.transferSingleEnterprise(
          tx, deal.targetEnterpriseId!, deal.sellerId, buyerId,
        );
        entCount  = transfers.enterprises;
        empCount  = transfers.employees;
        landCount = transfers.landPlots;
        whCount   = transfers.warehouses;
      }

      // ── Фінансовий розрахунок ─────────────────────────────────────────
      const sellerBalance   = new Decimal(seller.cashBalance.toString());
      const buyerAfter      = buyerBalance.minus(dealAmount);
      const sellerAfter     = sellerBalance.plus(dealAmount);

      await tx.player.update({
        where: { id: buyerId },
        data:  { cashBalance: buyerAfter },
      });
      await tx.player.update({
        where: { id: deal.sellerId },
        data:  { cashBalance: sellerAfter },
      });

      // FinancialTransaction для покупця
      await tx.financialTransaction.create({
        data: {
          playerId:      buyerId,
          type:          'MA_ACQUISITION_COST',
          amountUah:     dealAmount.negated(),
          balanceBefore: buyerBalance,
          balanceAfter:  buyerAfter,
          description:
            isFullBuyout
              ? `M&A: придбання компанії "${seller.companyName}" за ₴${dealAmount.toFixed(0)}`
              : `M&A: придбання підприємства (id: ${deal.targetEnterpriseId}) за ₴${dealAmount.toFixed(0)}`,
          referenceId:   dealId,
        },
      });

      // FinancialTransaction для продавця
      await tx.financialTransaction.create({
        data: {
          playerId:      deal.sellerId,
          type:          'MA_SALE_REVENUE',
          amountUah:     dealAmount,
          balanceBefore: sellerBalance,
          balanceAfter:  sellerAfter,
          description:
            isFullBuyout
              ? `M&A: продаж компанії покупцю "${buyer.companyName}" за ₴${dealAmount.toFixed(0)}`
              : `M&A: продаж підприємства покупцю "${buyer.companyName}" за ₴${dealAmount.toFixed(0)}`,
          referenceId:   dealId,
        },
      });

      // ── Завершення угоди ─────────────────────────────────────────────
      await tx.maDeal.update({
        where: { id: dealId },
        data: {
          buyerId,
          status:        'COMPLETED',
          executedAtTick: currentTick,
        },
      });

      return { entCount, empCount, landCount, whCount };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return {
      dealId,
      buyerId,
      sellerId:           deal.sellerId,
      amountUah:          dealAmount,
      transferredAssets:  {
        enterprises: result.entCount,
        employees:   result.empCount,
        landPlots:   result.landCount,
        warehouses:  result.whCount,
      },
      isFullCompanyBuyout: isFullBuyout,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ПРИВАТНЕ — ОБЧИСЛЕННЯ ОЦІНКИ
  // ══════════════════════════════════════════════════════════════════════════

  private async computeBreakdown(playerId: string): Promise<ValuationBreakdown> {
    const [
      landValue,
      equipValue,
      cashValue,
      inventoryValue,
      avgWeeklyEbitda,
      compliance,
    ] = await Promise.all([
      this.getLandValue(playerId),
      this.getEquipmentValue(playerId),
      this.getCashValue(playerId),
      this.getInventoryValue(playerId),
      this.getAvgWeeklyEbitda(playerId),
      this.db.complianceRecord.findUnique({
        where:  { playerId },
        select: { score: true },
      }),
    ]);

    const complianceScore  = compliance?.score ?? 1.0;
    const multiplier       = ebitdaMultiplier(complianceScore);
    const annualEbitda     = avgWeeklyEbitda.times(SNAPSHOTS_PER_YEAR);
    const ebitdaValue      = Decimal.max(new Decimal(0), annualEbitda.times(multiplier));

    const assetTotal  = landValue.plus(equipValue).plus(cashValue).plus(inventoryValue);
    const totalValuation = assetTotal.times(ASSET_WEIGHT)
      .plus(ebitdaValue.times(INCOME_WEIGHT));

    return {
      playerId,
      totalValuation,
      asset: {
        landValue,
        equipmentValue: equipValue,
        cashValue,
        inventoryValue,
        total:          assetTotal,
      },
      income: {
        avgWeeklyEbitda,
        annualEbitda,
        multiplier,
        complianceScore,
        total: ebitdaValue,
      },
    };
  }

  /** Land: власні ділянки × city.landPriceCoeff + NPV оренди (24 місяці). */
  private async getLandValue(playerId: string): Promise<Decimal> {
    type Row = { total: string | null };

    const [ownedRows, leasedRows] = await Promise.all([
      this.db.$queryRaw<Row[]>`
        SELECT COALESCE(SUM(lp."purchasePriceUah" * c."landPriceCoeff"), 0)::text AS total
        FROM   "LandPlot" lp
        JOIN   "City"     c  ON c.id = lp."cityId"
        WHERE  lp."playerId" = ${playerId}
          AND  lp.status     = 'OWNED'
      `,
      this.db.$queryRaw<Row[]>`
        SELECT COALESCE(SUM(lp."monthlyLeaseCostUah" * ${LEASE_NPV_MONTHS}), 0)::text AS total
        FROM   "LandPlot" lp
        WHERE  lp."playerId" = ${playerId}
          AND  lp.status     = 'LEASED'
      `,
    ]);

    return new Decimal(ownedRows[0]?.total  ?? '0')
      .plus(leasedRows[0]?.total ?? '0');
  }

  /** Equipment: Σ marketValueUah × (1 − wearAndTear) для не зламаного обладнання. */
  private async getEquipmentValue(playerId: string): Promise<Decimal> {
    type Row = { total: string | null };
    const rows = await this.db.$queryRaw<Row[]>`
      SELECT COALESCE(
        SUM(eq."marketValueUah" * (1.0 - eq."wearAndTear")), 0
      )::text AS total
      FROM  "Equipment"  eq
      JOIN  "Workshop"   ws  ON ws.id  = eq."workshopId"
      JOIN  "Enterprise" ent ON ent.id = ws."enterpriseId"
      WHERE ent."playerId" = ${playerId}
        AND eq."isBroken"  = false
    `;
    return new Decimal(rows[0]?.total ?? '0');
  }

  /** Cash: UAH + USD × FxRate. */
  private async getCashValue(playerId: string): Promise<Decimal> {
    const [player, fx] = await Promise.all([
      this.db.player.findUniqueOrThrow({
        where:  { id: playerId },
        select: { cashBalance: true, balanceUsd: true },
      }),
      this.db.fxRateSingleton.findUnique({ where: { id: FX_RATE_ID } }),
    ]);

    const uah     = new Decimal(player.cashBalance.toString());
    const usd     = new Decimal(player.balanceUsd.toString());
    const fxRate  = new Decimal(fx?.usdToUah?.toString() ?? '41.50');
    return uah.plus(usd.times(fxRate));
  }

  /** Inventory: Σ qty × avg(pricePerUnit) з актуальних SELL-ордерів ринку. */
  private async getInventoryValue(playerId: string): Promise<Decimal> {
    type Row = { total: string | null };
    const rows = await this.db.$queryRaw<Row[]>`
      SELECT COALESCE(
        SUM(ei.quantity * COALESCE(mp.avg_price, 0)), 0
      )::text AS total
      FROM   "EnterpriseInventory" ei
      JOIN   "Enterprise" ent ON ent.id = ei."enterpriseId"
      LEFT JOIN (
        SELECT   "productId", AVG("pricePerUnit") AS avg_price
        FROM     "MarketOrder"
        WHERE    type   = 'SELL'
          AND    status IN ('OPEN', 'PARTIALLY_FILLED')
        GROUP BY "productId"
      ) mp ON mp."productId" = ei."productId"
      WHERE ent."playerId" = ${playerId}
    `;
    return new Decimal(rows[0]?.total ?? '0');
  }

  /** EBITDA = avg(revenue − opex) за останні 4 DailySnapshot-и. */
  private async getAvgWeeklyEbitda(playerId: string): Promise<Decimal> {
    const snapshots = await this.db.dailySnapshot.findMany({
      where:   { playerId },
      orderBy: { tickNumber: 'desc' },
      take:    SNAPSHOTS_FOR_EBITDA,
      select:  { revenueUah: true, opexUah: true },
    });

    if (snapshots.length === 0) return new Decimal(0);

    const total = snapshots.reduce(
      (sum, s) => sum.plus(s.revenueUah.toString()).minus(s.opexUah.toString()),
      new Decimal(0),
    );
    return Decimal.max(new Decimal(0), total.dividedBy(snapshots.length));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ПРИВАТНЕ — ПЕРЕДАЧА ВЛАСНОСТІ
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Передає одне підприємство з усіма залежними записами новому власнику.
   * Workshops і Equipment не мають прямого playerId — переходять через Enterprise.
   *
   * Скасовує відкриті SELL-ордери продавця для інвентарю цього підприємства,
   * щоб уникнути торгівлі від імені колишнього власника.
   */
  private async transferSingleEnterprise(
    tx:           Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
    enterpriseId: string,
    sellerId:     string,
    buyerId:      string,
  ): Promise<{ enterprises: number; employees: number; landPlots: number; warehouses: number }> {
    const ent = await tx.enterprise.findUniqueOrThrow({
      where:   { id: enterpriseId },
      select:  { landPlotId: true },
    });

    // 1. Підприємство
    await tx.enterprise.update({
      where: { id: enterpriseId },
      data:  { playerId: buyerId },
    });

    // 2. Земельна ділянка
    await tx.landPlot.update({
      where: { id: ent.landPlotId },
      data:  { playerId: buyerId },
    });

    // 3. Працівники
    const { count: empCount } = await tx.employee.updateMany({
      where: { enterpriseId, playerId: sellerId },
      data:  { playerId: buyerId },
    });

    // 4. Склад (якщо є)
    const warehouse = await tx.warehouse.findUnique({ where: { enterpriseId } });
    if (warehouse) {
      await tx.warehouse.update({
        where: { enterpriseId },
        data:  { playerId: buyerId },
      });
    }

    // 5. Скасовуємо відкриті ордери продавця на товари з інвентарю підприємства.
    //    MarketOrder не зберігає enterpriseId безпосередньо, тому скасовуємо лише
    //    ті ордери, productId яких є у інвентарі цього підприємства.
    const inventoryItems = await tx.enterpriseInventory.findMany({
      where:  { enterpriseId },
      select: { productId: true },
    });
    const productIds = [...new Set(inventoryItems.map(i => i.productId))];
    if (productIds.length > 0) {
      await tx.marketOrder.updateMany({
        where: {
          playerId:  sellerId,
          type:      'SELL',
          status:    { in: ['OPEN', 'PARTIALLY_FILLED'] },
          productId: { in: productIds },
        },
        data: { status: 'CANCELLED' },
      });
    }

    // 6. SecuritySystem (якщо є)
    const secSys = await tx.securitySystem.findUnique({ where: { enterpriseId } });
    if (secSys) {
      await tx.securitySystem.update({
        where: { enterpriseId },
        data:  { playerId: buyerId },
      });
    }

    // 7. EnergyContract (якщо є)
    await tx.energyContract.updateMany({
      where: { enterpriseId, playerId: sellerId },
      data:  { playerId: buyerId },
    });

    return { enterprises: 1, employees: empCount, landPlots: 1, warehouses: warehouse ? 1 : 0 };
  }

  /**
   * Передає ВСІ активи компанії від sellerId до buyerId.
   *
   * Порядок передачі важливий для referential integrity:
   *   1. Enterprise (+ каскадно Warehouse, Inventory — через FK)
   *   2. Employee (пряме playerId)
   *   3. LandPlot (пряме playerId)
   *   4. Warehouse (пряме playerId)
   *   5. Office: для OFFICE-type enterprises, playerId → buyerId (якщо у покупця
   *      вже є офіс у тому самому місті — видаляємо дублікат продавця)
   *   6. AutoContract, HRAutomationPolicy
   *   7. Відкриті ордери на продаж скасовуємо (покупець управляє своїми ордерами)
   */
  private async transferAllAssets(
    tx:       Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
    sellerId: string,
    buyerId:  string,
  ): Promise<{ enterprises: number; employees: number; landPlots: number; warehouses: number }> {

    // ── 1. Отримуємо список підприємств (потрібен для офісів) ────────────
    const enterprises = await tx.enterprise.findMany({
      where:   { playerId: sellerId },
      include: { office: true },
    });

    // ── 2. Office: обробляємо конфлікти @@unique([playerId, cityId]) ─────
    for (const ent of enterprises) {
      if (!ent.office) continue;  // не OFFICE-type

      const buyerHasOffice = await tx.office.findUnique({
        where: { playerId_cityId: { playerId: buyerId, cityId: ent.office.cityId } },
      });

      if (buyerHasOffice) {
        // Покупець вже має офіс у цьому місті → видаляємо дублікат продавця
        await tx.office.delete({ where: { id: ent.office.id } });
      } else {
        // Передаємо офіс покупцеві
        await tx.office.update({
          where: { id: ent.office.id },
          data:  { playerId: buyerId },
        });
      }
    }

    // ── 3. Підприємства ───────────────────────────────────────────────────
    const { count: entCount } = await tx.enterprise.updateMany({
      where: { playerId: sellerId },
      data:  { playerId: buyerId },
    });

    // ── 4. Працівники ─────────────────────────────────────────────────────
    const { count: empCount } = await tx.employee.updateMany({
      where: { playerId: sellerId },
      data:  { playerId: buyerId },
    });

    // ── 5. Земельні ділянки ───────────────────────────────────────────────
    const { count: landCount } = await tx.landPlot.updateMany({
      where: { playerId: sellerId },
      data:  { playerId: buyerId },
    });

    // ── 6. Склади ─────────────────────────────────────────────────────────
    const { count: whCount } = await tx.warehouse.updateMany({
      where: { playerId: sellerId },
      data:  { playerId: buyerId },
    });

    // ── 7. SecuritySystem ─────────────────────────────────────────────────
    await tx.securitySystem.updateMany({
      where: { playerId: sellerId },
      data:  { playerId: buyerId },
    });

    // ── 8. EnergyContract ─────────────────────────────────────────────────
    await tx.energyContract.updateMany({
      where: { playerId: sellerId },
      data:  { playerId: buyerId },
    });

    // ── 9. AutoContract ───────────────────────────────────────────────────
    await tx.autoContract.updateMany({
      where: { buyerId: sellerId },
      data:  { buyerId },
    });

    // ── 10. HR Policy ─────────────────────────────────────────────────────
    // HRAutomationPolicy.playerId @unique → може конфліктувати якщо у покупця є
    const sellerHrPolicy = await tx.hRAutomationPolicy.findUnique({
      where: { playerId: sellerId },
    });
    if (sellerHrPolicy) {
      const buyerHrPolicy = await tx.hRAutomationPolicy.findUnique({
        where: { playerId: buyerId },
      });
      if (!buyerHrPolicy) {
        await tx.hRAutomationPolicy.update({
          where: { playerId: sellerId },
          data:  { playerId: buyerId },
        });
      } else {
        // Покупець вже має власну HR-політику → видаляємо дублікат
        await tx.hRAutomationPolicy.delete({ where: { playerId: sellerId } });
      }
    }

    // ── 11. Скасовуємо відкриті ордери продавця ───────────────────────────
    await tx.marketOrder.updateMany({
      where: { playerId: sellerId, status: { in: ['OPEN', 'PARTIALLY_FILLED'] } },
      data:  { status: 'CANCELLED' },
    });

    return { enterprises: entCount, employees: empCount, landPlots: landCount, warehouses: whCount };
  }
}
