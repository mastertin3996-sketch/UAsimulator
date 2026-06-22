import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import ProductionOptimizerClient from "@/components/game/ProductionOptimizerClient";

export const metadata = { title: "Оптимізатор виробництва — VirtuNomix" };

export default async function OptimizerPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <ProductionOptimizerClient />;
}
