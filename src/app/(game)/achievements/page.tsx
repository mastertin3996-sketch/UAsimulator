import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import AchievementsClient from "@/components/game/AchievementsClient";

export const metadata = { title: "Досягнення — VirtuNomix" };

export default async function AchievementsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <AchievementsClient />;
}
