import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import EnterpriseDetailClient from "@/components/game/EnterpriseDetailClient";

type Props = {
  params     : Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

const VALID_TABS = ["management", "warehouse", "supply", "showcase", "production", "hr", "workshops"] as const;
type Tab = typeof VALID_TABS[number];

export default async function EnterpriseDetailPage({ params, searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { id }  = await params;
  const { tab } = await searchParams;
  const initialTab = VALID_TABS.includes(tab as Tab) ? (tab as Tab) : undefined;
  return <EnterpriseDetailClient enterpriseId={id} initialTab={initialTab} />;
}
