import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { IntelligenceClient } from "@/components/game/IntelligenceClient";

export default async function IntelligencePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <IntelligenceClient />;
}
