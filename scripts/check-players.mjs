import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const players = await p.player.findMany({
  where: { isNpcSeller: false },
  select: { id: true, username: true, email: true, createdAt: true, cashBalance: true },
  orderBy: { createdAt: 'desc' },
});
console.log('Human players:', players.length);
players.forEach(pl => console.log(` - ${pl.username} (${pl.email}) ₴${Number(pl.cashBalance).toFixed(0)} created:${pl.createdAt.toISOString().slice(0,10)}`));
await p.$disconnect();
