/**
 * B2bTransferService — автоматичний внутрішній трансфер товарів між підприємствами гравця.
 *
 * Гравець налаштовує угоду: з підприємства A → в підприємство B, N одиниць/тік, ціна.
 * Щотік: якщо є запас у A — переміщуємо до B, транзакція = внутрішня (нульова вартість).
 * Ціна=0 означає безкоштовний трансфер; ненульова ціна фіксується в аналітиці.
 */

import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export class B2bTransferService {
  constructor(private readonly prisma: PrismaClient) {}

  async processTransfers(tickNumber: bigint): Promise<number> {
    const agreements = await this.prisma.b2bTransferAgreement.findMany({
      where: { isActive: true },
      include: {
        product: { select: { id: true, nameUa: true, sku: true } },
      },
    });

    let executed = 0;

    for (const ag of agreements) {
      // Перевіряємо джерельний інвентар
      const srcInv = await this.prisma.enterpriseInventory.findUnique({
        where: { enterpriseId_productId: { enterpriseId: ag.sourceEnterpriseId, productId: ag.productId } },
        select: { id: true, quantity: true, avgQuality: true },
      });
      if (!srcInv || Number(srcInv.quantity) < 0.001) continue;

      const transferQty = Math.min(ag.quantityPerTick, Number(srcInv.quantity));
      if (transferQty < 0.001) continue;

      // Отримуємо або створюємо цільовий інвентар
      const dstInv = await this.prisma.enterpriseInventory.findUnique({
        where: { enterpriseId_productId: { enterpriseId: ag.targetEnterpriseId, productId: ag.productId } },
        select: { id: true, quantity: true, avgQuality: true },
      });

      const srcQty = Number(srcInv.quantity);
      const srcQ   = srcInv.avgQuality;
      const dstQty = dstInv ? Number(dstInv.quantity) : 0;
      const dstQ   = dstInv ? dstInv.avgQuality : srcQ;
      const newDstQty = dstQty + transferQty;
      const newDstQ   = newDstQty > 0
        ? (dstQ * dstQty + srcQ * transferQty) / newDstQty
        : srcQ;

      const ops = [
        // Знімаємо з джерела
        this.prisma.enterpriseInventory.update({
          where: { id: srcInv.id },
          data:  { quantity: { decrement: transferQty } },
        }),
        // Оновлюємо totalTransferred
        this.prisma.b2bTransferAgreement.update({
          where: { id: ag.id },
          data:  { totalTransferred: { increment: transferQty }, lastExecutedTick: tickNumber },
        }),
      ];

      if (dstInv) {
        ops.push(
          this.prisma.enterpriseInventory.update({
            where: { id: dstInv.id },
            data:  { quantity: { increment: transferQty }, avgQuality: newDstQ },
          }) as unknown as typeof ops[0]
        );
      } else {
        ops.push(
          this.prisma.enterpriseInventory.create({
            data: {
              enterpriseId: ag.targetEnterpriseId,
              productId:    ag.productId,
              quantity:     transferQty,
              avgQuality:   srcQ,
            },
          }) as unknown as typeof ops[0]
        );
      }

      // Якщо є ціна — записуємо фінансову транзакцію (переміщення коштів між аналітичними центрами)
      if (Number(ag.pricePerUnit) > 0) {
        const value = new Decimal(ag.pricePerUnit.toString()).times(transferQty);
        const player = await this.prisma.player.findUnique({
          where: { id: ag.playerId }, select: { cashBalance: true },
        });
        const bal = new Decimal(player?.cashBalance?.toString() ?? '0');
        ops.push(
          this.prisma.financialTransaction.create({
            data: {
              playerId:    ag.playerId,
              type:        'INTERNAL_TRANSFER',
              amountUah:   value,
              balanceBefore: bal,
              balanceAfter:  bal,
              description: `B2B трансфер: ${ag.product.nameUa} × ${transferQty.toFixed(1)} (внутр.)`,
            },
          }) as unknown as typeof ops[0]
        );
      }

      await this.prisma.$transaction(ops);
      executed++;
    }

    return executed;
  }
}
