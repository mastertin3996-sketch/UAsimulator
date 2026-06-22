import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import SettingsClient from "@/components/game/SettingsClient";

export const metadata = { title: "Налаштування — VirtuNomix" };

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <SettingsClient />;
}
