import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import ResearchClient from "@/components/game/ResearchClient";

export const metadata = { title: "R&D Центр — VirtuNomix" };

export default async function ResearchPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <ResearchClient />;
}
