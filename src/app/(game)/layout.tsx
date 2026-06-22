import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import { prisma } from "@/lib/prisma";
import { SessionProvider } from "next-auth/react";

export default async function GameLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const player = await prisma.player.findUnique({
    where:  { id: session.user.id },
    select: { cashBalance: true, balanceUsd: true, companyName: true },
  });

  return (
    <SessionProvider>
      <div className="min-h-screen bg-gray-950 text-white">
        <Sidebar />
        <TopBar
          cashBalance={Number(player?.cashBalance ?? 0)}
          balanceUsd={Number(player?.balanceUsd ?? 0)}
          companyName={player?.companyName}
        />
        <main className="ml-60 pt-14 min-h-screen">
          <div className="p-6">{children}</div>
        </main>
      </div>
    </SessionProvider>
  );
}
