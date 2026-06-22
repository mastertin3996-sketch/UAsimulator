/**
 * POST   /api/lines/:lid/workers  — призначити роль на лінію
 * DELETE /api/lines/:lid/workers  — зняти роль з лінії
 *   Body: { roleId: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { auth }                      from "@/lib/auth";
import { prisma }                    from "@/lib/prisma";
import { ENTERPRISE_ROLES }          from "@/lib/hr-config";

async function getLineAndValidate(lid: string, userId: string) {
  const line = await prisma.productionLine.findUnique({
    where : { id: lid },
    select: {
      id      : true,
      workshop: {
        select: {
          office: {
            select: {
              enterprise: {
                select: {
                  id              : true,
                  enterpriseTypeId: true,
                  company         : { select: { ownerId: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!line) return { error: "Лінія не знайдена", status: 404, line: null };
  const enterprise = line.workshop.office.enterprise;
  if (enterprise.company.ownerId !== userId) return { error: "Forbidden", status: 403, line: null };
  return { error: null, status: 200, line, enterprise };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ lid: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { lid }    = await params;
  const { roleId } = await req.json() as { roleId: string };

  if (!roleId?.trim()) return NextResponse.json({ error: "roleId обов'язковий" }, { status: 400 });

  const { error, status, line, enterprise } = await getLineAndValidate(lid, session.user.id);
  if (error || !line || !enterprise) return NextResponse.json({ error }, { status });

  // Перевіряємо що roleId входить у дозволені ролі цього підприємства
  const allowedRoles = ENTERPRISE_ROLES[enterprise.enterpriseTypeId] ?? [];
  if (allowedRoles.length > 0 && !allowedRoles.includes(roleId)) {
    return NextResponse.json({
      error: `Роль ${roleId} не входить у перелік ролей цього підприємства`,
    }, { status: 400 });
  }

  const worker = await prisma.lineWorker.upsert({
    where : { lineId_roleId: { lineId: lid, roleId } },
    update: {},
    create: { lineId: lid, roleId },
  });

  return NextResponse.json({ ok: true, worker }, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ lid: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { lid }    = await params;
  const { roleId } = await req.json() as { roleId: string };

  if (!roleId?.trim()) return NextResponse.json({ error: "roleId обов'язковий" }, { status: 400 });

  const { error, status, line } = await getLineAndValidate(lid, session.user.id);
  if (error || !line) return NextResponse.json({ error }, { status });

  await prisma.lineWorker.deleteMany({ where: { lineId: lid, roleId } });

  return NextResponse.json({ ok: true });
}
