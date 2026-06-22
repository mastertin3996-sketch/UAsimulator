import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import RatingsClient from "@/components/game/RatingsClient";

export const metadata = { title: "Рейтинги — VirtuNomix" };

export default async function RatingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <RatingsClient />;
}
