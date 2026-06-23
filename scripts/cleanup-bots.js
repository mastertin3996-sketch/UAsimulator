const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const botUsernames = [
    'bot_bread','bot_oil','bot_dairy','bot_pasta','bot_sugar',
    'bot_wheat','bot_steel','bot_steelprod','bot_furniture','bot_sawmill'
  ];

  const players = await p.player.findMany({
    where: { username: { in: botUsernames } },
    select: { id: true, username: true },
  });

  console.log(`Found ${players.length} bot players to clean up`);

  for (const pl of players) {
    const enterprises = await p.enterprise.findMany({ where: { playerId: pl.id }, select: { id: true } });
    for (const ent of enterprises) {
      const workshops = await p.workshop.findMany({ where: { enterpriseId: ent.id }, select: { id: true } });
      for (const ws of workshops) {
        await p.productionOrder.deleteMany({ where: { workshopId: ws.id } });
        await p.equipment.deleteMany({ where: { workshopId: ws.id } });
      }
      await p.workshop.deleteMany({ where: { enterpriseId: ent.id } });
      await p.employee.deleteMany({ where: { enterpriseId: ent.id } });
      await p.enterpriseInventory.deleteMany({ where: { enterpriseId: ent.id } });
    }
    await p.enterprise.deleteMany({ where: { playerId: pl.id } });
    // Release land plots
    await p.landPlot.updateMany({ where: { playerId: pl.id }, data: { playerId: null, status: 'AVAILABLE' } });
    // Delete player-level records
    await p.energyBill.deleteMany({ where: { playerId: pl.id } }).catch(() => {});
    await p.financialTransaction.deleteMany({ where: { playerId: pl.id } }).catch(() => {});
    await p.loanPayment.deleteMany({ where: { loan: { playerId: pl.id } } }).catch(() => {});
    await p.loan.deleteMany({ where: { playerId: pl.id } }).catch(() => {});
    await p.taxRecord.deleteMany({ where: { playerId: pl.id } }).catch(() => {});
    await p.playerTechnology.deleteMany({ where: { playerId: pl.id } }).catch(() => {});
    await p.marketOrder.deleteMany({ where: { playerId: pl.id } }).catch(() => {});
    await p.replenishRule.deleteMany({ where: { playerId: pl.id } }).catch(() => {});
    await p.withdrawalRequest.deleteMany({ where: { playerId: pl.id } }).catch(() => {});
    await p.financialLog.deleteMany({ where: { playerId: pl.id } }).catch(() => {});
    await p.dailySnapshot.deleteMany({ where: { playerId: pl.id } }).catch(() => {});
    await p.productionLog.deleteMany({ where: { playerId: pl.id } }).catch(() => {});
    await p.autoContract.deleteMany({ where: { buyerId: pl.id } }).catch(() => {});
    await p.autoContract.deleteMany({ where: { sellerId: pl.id } }).catch(() => {});
    await p.playerInventory.deleteMany({ where: { playerId: pl.id } }).catch(() => {});
    // Use raw SQL to bypass RESTRICT FK ordering issues
    await p.$executeRawUnsafe(`DELETE FROM "ComplianceRecord" WHERE "playerId" = '${pl.id}'`).catch(e => console.log('CR:', e.message));
    await p.$executeRawUnsafe(`DELETE FROM "TaxInspection" WHERE "playerId" = '${pl.id}'`).catch(e => console.log('TI:', e.message));
    await p.$executeRawUnsafe(`DELETE FROM "License" WHERE "playerId" = '${pl.id}'`).catch(e => console.log('Lic:', e.message));
    await p.$executeRawUnsafe(`DELETE FROM "Patent" WHERE "playerId" = '${pl.id}'`).catch(e => console.log('Pat:', e.message));
    await p.$executeRawUnsafe(`DELETE FROM "SubsidyApplication" WHERE "playerId" = '${pl.id}'`).catch(e => console.log('SA:', e.message));
    await p.$executeRawUnsafe(`DELETE FROM "CustomsDeclaration" WHERE "playerId" = '${pl.id}'`).catch(e => console.log('CD:', e.message));
  }

  // Delete gameTick records for clean simulation
  await p.gameTick.deleteMany({}).catch(() => {});
  await p.player.deleteMany({ where: { username: { in: botUsernames } } });
  // Also clean up game ticks for fresh simulation
  await p.gameTick.deleteMany({});
  console.log('Cleanup complete');
}

main().catch(console.error).finally(() => p.$disconnect());
