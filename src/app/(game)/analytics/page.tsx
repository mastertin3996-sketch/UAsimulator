import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import MarketAnalyticsClient from "@/components/game/MarketAnalyticsClient";

export const metadata = { title: "Аналітика ринку — VirtuNomix" };

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <MarketAnalyticsClient />;
}
