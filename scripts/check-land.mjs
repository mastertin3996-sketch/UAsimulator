import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const player = await p.player.findFirst({ where: { username: 'Анатолій' }, select: { id: true } });
console.log('Player ID:', player?.id);

const plots = await p.landPlot.findMany({
  where: { playerId: player?.id },
  select: { id: true, cadastralNumber: true, status: true, playerId: true, totalAreaM2: true },
});
console.log('Land plots owned by Анатолій:', plots.length);
plots.forEach(pl => console.log(` - ${pl.cadastralNumber} status:${pl.status} playerId:${pl.playerId}`));

await p.$disconnect();
