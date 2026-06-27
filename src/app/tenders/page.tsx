import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TendersClient } from "@/components/game/TendersClient";

export default async function TendersPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <TendersClient />;
}
