import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminGmPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-red-950 flex items-center justify-center"><span className="text-2xl">🛡️</span></div>
      <h1 className="text-xl font-bold text-white">Панель GM</h1>
      <p className="text-gray-500 text-sm">GM-панель розробляється.</p>
    </div>
  );
}
