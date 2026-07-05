// Одноразовий скрипт (Фаза 3 плану workshop-scoped staffing).
// Запускати ОДИН РАЗ, одразу після прод-деплою Фази 2 (hire/UI/перепризначення),
// перед Фазою 4 (рушій тіку — той момент, коли неприкріплений персонал реально
// перестане впливати на виробництво). Дає гравцям реальне вікно для реакції.
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const unassigned = await p.employee.findMany({
  where: { workshopId: null },
  select: { playerId: true, enterprise: { select: { name: true } } },
});

const byPlayer = new Map();
for (const e of unassigned) {
  const list = byPlayer.get(e.playerId) ?? [];
  list.push(e.enterprise.name);
  byPlayer.set(e.playerId, list);
}

console.log(`Гравців з неприкріпленим персоналом: ${byPlayer.size}`);

for (const [playerId, enterpriseNames] of byPlayer) {
  const uniqueNames = [...new Set(enterpriseNames)];
  const count = enterpriseNames.length;
  await p.notification.create({
    data: {
      playerId,
      type:  'WARNING',
      title: `${count} співробітник(ів) не прикріплено до цеху`,
      body:  `На підприємствах (${uniqueNames.join(', ')}) є персонал без прив'язки до конкретного цеху. Незабаром такий персонал перестане впливати на виробництво — зайдіть у вкладку «Персонал» і призначте кожного на цех.`,
    },
  });
}

console.log('Сповіщення надіслано.');
await p.$disconnect();
