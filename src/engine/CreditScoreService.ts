/**
 * CreditScoreService — рейтинг ділової репутації гравця (0–1000).
 *
 * Зростає від:
 *  - Своєчасної сплати кредитів (+5/платіж)
 *  - Своєчасної сплати податків (+2/тік без боргу)
 *  - Виплати зарплат без затримок (+1/тік)
 *  - Виконання держзамовлень (+15/виконання)
 *
 * Падає від:
 *  - Податкової перевірки/штрафу (−30)
 *  - Страйку працівників (−10)
 *  - Дефолту кредиту (−50)
 *  - Регуляторного порушення (−20 / −50 за SEVERE)
 *  - Банкрутства (−200)
 *
 * Ефекти:
 *  - < 300: +2% до відсоткової ставки по кредитах
 *  - 300–599: стандартна ставка
 *  - 600–799: −1% до ставки
 *  - ≥ 800: −2% до ставки + пропуск регуляторних перевірок
 */

import { PrismaClient } from '@prisma/client';

export class CreditScoreService {
  constructor(private readonly prisma: PrismaClient) {}

  static clamp(score: number): number {
    return Math.max(0, Math.min(1000, Math.round(score)));
  }

  // Повертає модифікатор процентної ставки по кредиту для даного score
  static loanRateModifier(score: number): number {
    if (score >= 800) return -2.0;
    if (score >= 600) return -1.0;
    if (score < 300)  return +2.0;
    return 0;
  }

  // Гравці з score ≥ 800 пропускають регуляторні перевірки
  static isWhitelisted(score: number): boolean {
    return score >= 800;
  }

  async adjust(playerId: string, delta: number): Promise<number> {
    const player = await this.prisma.player.findUnique({
      where:  { id: playerId },
      select: { creditScore: true },
    });
    const current = player?.creditScore ?? 500;
    const next = CreditScoreService.clamp(current + delta);
    await this.prisma.player.update({
      where: { id: playerId },
      data:  { creditScore: next },
    });
    return next;
  }

  // Щотіковий пасивний приріст: +1 якщо немає прострочених кредитів і боргів
  async tickPassiveGrowth(playerId: string): Promise<void> {
    const player = await this.prisma.player.findUnique({
      where:  { id: playerId },
      select: { creditScore: true, currentOverdraftUsageUah: true },
    });
    if (!player || (player.creditScore ?? 500) >= 1000) return;

    const overdraft = Number(player.currentOverdraftUsageUah ?? 0);
    const hasOverdueLoans = await this.prisma.loan.count({
      where: { playerId, status: { in: ['OVERDUE', 'DEFAULTED'] } },
    });

    if (overdraft <= 0 && hasOverdueLoans === 0) {
      await this.adjust(playerId, 1);
    }
  }

  // Виклик при успішному платежі по кредиту
  async onLoanPayment(playerId: string): Promise<void> {
    await this.adjust(playerId, 5);
  }

  // Виклик при дефолті кредиту
  async onLoanDefault(playerId: string): Promise<void> {
    await this.adjust(playerId, -50);
  }

  // Виклик при штрафі від TaxInspection або RegulatoryInspection
  async onRegulationFine(playerId: string, severe = false): Promise<void> {
    await this.adjust(playerId, severe ? -50 : -20);
  }

  // Виклик при страйку
  async onStrike(playerId: string): Promise<void> {
    await this.adjust(playerId, -10);
  }

  // Виклик при виконанні держзамовлення
  async onGovOrderFulfilled(playerId: string): Promise<void> {
    await this.adjust(playerId, 15);
  }

  async getScore(playerId: string): Promise<number> {
    const p = await this.prisma.player.findUnique({
      where:  { id: playerId },
      select: { creditScore: true },
    });
    return p?.creditScore ?? 500;
  }
}
