import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LandMarketClient } from "@/components/game/LandMarketClient";

export default async function LandPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <LandMarketClient />;
}
