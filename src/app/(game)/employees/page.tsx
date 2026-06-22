import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import EmployeesClient from "@/components/game/EmployeesClient";

export const metadata = { title: "Персонал — VirtuNomix" };

export default async function EmployeesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <EmployeesClient />;
}
