import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SessionProvider } from "next-auth/react";
import GameShell from "@/components/layout/GameShell";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "mastertin3996@gmail.com";

export default async function GameLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const player = await prisma.player.findUnique({
    where:  { id: session.user.id },
    select: { cashBalance: true, balanceUsd: true, companyName: true },
  });

  const isAdmin = session.user.email === ADMIN_EMAIL;

  return (
    <SessionProvider>
      <GameShell
        cashBalance={Number(player?.cashBalance ?? 0)}
        balanceUsd={Number(player?.balanceUsd ?? 0)}
        companyName={player?.companyName ?? undefined}
        isAdmin={isAdmin}
      >
        {children}
      </GameShell>
    </SessionProvider>
  );
}
