import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { WarehouseClient } from "@/components/game/WarehouseClient";

export default async function WarehousePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <WarehouseClient />;
}
