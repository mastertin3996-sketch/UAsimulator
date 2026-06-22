import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import WarehousesClient from "@/components/game/WarehousesClient";

export const metadata = { title: "Склади — VirtuNomix" };

export default async function WarehousesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <WarehousesClient />;
}
