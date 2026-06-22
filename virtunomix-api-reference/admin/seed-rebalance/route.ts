/**
 * POST /api/admin/seed-rebalance
 *
 * Перекалібрування економічної моделі під добовий формат (1 тік = 1 день = 1 год).
 *
 * Що оновлює:
 *   - EnterpriseRoleSalary: upsert для кожної ролі → ринкова ставка для міста
 *   - enterprise.salaryOffered: зважена ринкова ставка (глобальний fallback)
 *   - enterprise.satisfaction: перераховується
 *   - enterprise.strikeEndsAt: null (скидаємо страйки)
 */

import { NextResponse }          from "next/server";
import { prisma }                from "@/lib/prisma";
import {
  getEnterpriseRoles,
  getWeightedMarketSalary,
  getRoleWorkerCounts,
  computeMood,
} from "@/lib/hr-config";

export async function POST() {
  const enterprises = await prisma.enterprise.findMany({
    select: {
      id              : true,
      enterpriseTypeId: true,
      workersCurrent  : true,
      city            : { select: { name: true } },
    },
  });

  let updatedEnterprises = 0;
  let updatedRoles       = 0;

  for (const ent of enterprises) {
    const cityName     = ent.city.name;
    const roles        = getEnterpriseRoles(ent.enterpriseTypeId, cityName);
    const marketSalary = getWeightedMarketSalary(ent.enterpriseTypeId, cityName);

    // Upsert per-role salaries
    for (const role of roles) {
      await prisma.enterpriseRoleSalary.upsert({
        where : { enterpriseId_roleId: { enterpriseId: ent.id, roleId: role.id } },
        update: { salaryOffered: role.marketSalaryLocal },
        create: { enterpriseId: ent.id, roleId: role.id, salaryOffered: role.marketSalaryLocal },
      });
      updatedRoles++;
    }

    // Оновлюємо enterprise (глобальний fallback + satisfaction + скидаємо страйк)
    const mood = computeMood(marketSalary, marketSalary); // = 0.80
    await prisma.enterprise.update({
      where: { id: ent.id },
      data : {
        salaryOffered: marketSalary,
        satisfaction : mood,
        strikeEndsAt : null,
      },
    });
    updatedEnterprises++;
  }

  return NextResponse.json({
    ok                : true,
    message           : `Перекалібровано ${updatedEnterprises} підприємств (${updatedRoles} ролей) до добових ринкових ставок (1 GC/тік = 1 UAH/день = 30 UAH/місяць)`,
    updatedEnterprises,
    updatedRoles,
  });
}
