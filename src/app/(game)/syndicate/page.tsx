import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import SyndicateClient from "@/components/game/SyndicateClient";

export default async function SyndicatePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <SyndicateClient />;
}
