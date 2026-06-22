import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import MyOffersClient from "@/components/game/MyOffersClient";

export const metadata = { title: "Мої оферти — VirtuNomix" };

export default async function MyOffersPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <MyOffersClient />;
}
