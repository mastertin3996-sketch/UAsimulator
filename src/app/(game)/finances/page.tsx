import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import FinancesClient from "@/components/game/FinancesClient";

export const metadata = { title: "Фінанси — VirtuNomix" };

export default async function FinancesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <FinancesClient />;
}
