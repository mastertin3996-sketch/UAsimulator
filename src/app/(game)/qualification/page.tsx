import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import QualificationClient from "@/components/game/QualificationClient";

export const metadata = { title: "Кваліфікація — VirtuNomix" };

export default async function QualificationPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <QualificationClient />;
}
