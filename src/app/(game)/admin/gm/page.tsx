import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import GmPanelClient from "@/components/game/GmPanelClient";

export const metadata = { title: "GM Панель — VirtuNomix" };

export default async function AdminGmPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <GmPanelClient />;
}
