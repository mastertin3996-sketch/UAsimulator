import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminWithdrawalsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
      <h1 className="text-xl font-bold text-white">Виведення коштів</h1>
      <p className="text-gray-500 text-sm">Розробляється.</p>
    </div>
  );
}
