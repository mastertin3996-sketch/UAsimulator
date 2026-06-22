import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import WalletClient from "@/components/game/WalletClient";

export const metadata = { title: "Гаманець — VirtuNomix" };

export default async function WalletPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <WalletClient />;
}
