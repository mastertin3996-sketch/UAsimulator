import { Badge } from "@/components/ui/badge";
import { Pickaxe, Factory, ShoppingCart, Warehouse } from "lucide-react";

const config = {
  EXTRACTION: { label: "Видобуток", icon: Pickaxe,      variant: "extraction" as const },
  PRODUCTION: { label: "Виробництво", icon: Factory,    variant: "production" as const },
  TRADE:      { label: "Торгівля", icon: ShoppingCart,  variant: "trade" as const },
  LOGISTICS:  { label: "Логістика", icon: Warehouse,    variant: "logistics" as const },
};

export function EnterpriseCategoryBadge({ category }: { category: keyof typeof config }) {
  const { label, icon: Icon, variant } = config[category] ?? config.PRODUCTION;
  return (
    <Badge variant={variant}>
      <Icon size={11} />
      {label}
    </Badge>
  );
}
