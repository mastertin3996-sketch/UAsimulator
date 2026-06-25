"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Building2, LayoutDashboard, ShoppingCart, TrendingUp,
  Warehouse, FlaskConical, Factory, Truck, Banknote, Wallet,
  Users, Trophy, BarChart2, Tag, History, ScrollText, Bot,
  BadgeCheck, GraduationCap, CandlestickChart, Landmark, Cpu,
  Bell, Settings, X, CornerDownLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Static nav items ─────────────────────────────────────────────────────────

interface NavItem { href: string; label: string; group: string; Icon: React.FC<{ size?: number; className?: string }> }

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard",        label: "Дашборд",          group: "Навігація", Icon: LayoutDashboard   },
  { href: "/notifications",    label: "Сповіщення",        group: "Навігація", Icon: Bell              },
  { href: "/enterprises",      label: "Підприємства",      group: "Виробництво", Icon: Building2       },
  { href: "/enterprises/create", label: "Нове підприємство", group: "Виробництво", Icon: Building2     },
  { href: "/employees",        label: "Персонал",          group: "Виробництво", Icon: Users           },
  { href: "/qualification",    label: "Кваліфікація",      group: "Виробництво", Icon: GraduationCap   },
  { href: "/research",         label: "Дослідження",       group: "Виробництво", Icon: FlaskConical    },
  { href: "/production-history", label: "Виробництво",     group: "Виробництво", Icon: Factory         },
  { href: "/warehouses",       label: "Склади",             group: "Виробництво", Icon: Warehouse       },
  { href: "/licenses",         label: "Ліцензії",          group: "Виробництво", Icon: BadgeCheck      },
  { href: "/market",           label: "Ринок",              group: "Торгівля",  Icon: ShoppingCart     },
  { href: "/my-offers",        label: "Мої оферти",        group: "Торгівля",  Icon: Tag              },
  { href: "/market-history",   label: "Угоди",              group: "Торгівля",  Icon: History          },
  { href: "/contracts",        label: "Контракти",         group: "Торгівля",  Icon: ScrollText        },
  { href: "/supply-routes",    label: "Постачання",        group: "Торгівля",  Icon: Truck             },
  { href: "/auto-replenish",   label: "Автозакупка",       group: "Торгівля",  Icon: Bot               },
  { href: "/finances",         label: "Фінанси",           group: "Фінанси",   Icon: TrendingUp        },
  { href: "/banking",          label: "Банківська",        group: "Фінанси",   Icon: Banknote          },
  { href: "/wallet",           label: "Гаманець",          group: "Фінанси",   Icon: Wallet            },
  { href: "/stock-exchange",   label: "Біржа",              group: "Фінанси",   Icon: CandlestickChart  },
  { href: "/ma",               label: "M&A",               group: "Компанія",  Icon: Landmark          },
  { href: "/syndicate",        label: "Синдикат",          group: "Компанія",  Icon: Users             },
  { href: "/optimizer",        label: "Оптимізатор",       group: "Компанія",  Icon: Cpu               },
  { href: "/ratings",          label: "Рейтинги",          group: "Компанія",  Icon: Trophy            },
  { href: "/analytics",        label: "Аналітика",         group: "Компанія",  Icon: BarChart2         },
  { href: "/settings",         label: "Налаштування",      group: "Компанія",  Icon: Settings          },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface EnterpriseItem { id: string; name: string; typeName: string }

interface Result {
  key   : string;
  href  : string;
  label : string;
  sub   : string;
  Icon  : React.FC<{ size?: number; className?: string }>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query,       setQuery]       = useState("");
  const [enterprises, setEnterprises] = useState<EnterpriseItem[]>([]);
  const [cursor,      setCursor]      = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router   = useRouter();

  // Fetch enterprises once when first opened
  useEffect(() => {
    if (!open || enterprises.length > 0) return;
    fetch("/api/enterprises?take=100")
      .then((r) => r.json())
      .then((d) => setEnterprises(d.enterprises ?? d.items ?? d ?? []))
      .catch(() => {});
  }, [open, enterprises.length]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setCursor(0);
    }
  }, [open]);

  const q = query.toLowerCase().trim();

  const results: Result[] = [];

  // Match nav items
  for (const item of NAV_ITEMS) {
    if (!q || item.label.toLowerCase().includes(q) || item.group.toLowerCase().includes(q)) {
      results.push({ key: item.href, href: item.href, label: item.label, sub: item.group, Icon: item.Icon });
    }
  }

  // Match enterprises
  for (const e of enterprises) {
    if (!q || e.name.toLowerCase().includes(q) || e.typeName.toLowerCase().includes(q)) {
      results.push({ key: `ent-${e.id}`, href: `/enterprises/${e.id}`, label: e.name, sub: e.typeName, Icon: Building2 });
    }
  }

  // Limit
  const shown = results.slice(0, 8);

  const navigate = useCallback((href: string) => {
    router.push(href);
    onClose();
  }, [router, onClose]);

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter" && shown[cursor]) {
      navigate(shown[cursor].href);
    } else if (e.key === "Escape") {
      onClose();
    }
  }, [shown, cursor, navigate, onClose]);

  // Reset cursor when results change
  useEffect(() => { setCursor(0); }, [query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel */}
      <div className="relative w-full max-w-lg bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
          <Search size={16} className="text-gray-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Пошук сторінок та підприємств…"
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none"
          />
          <button onClick={onClose} className="text-gray-600 hover:text-gray-400 transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-1.5">
          {shown.length === 0 ? (
            <p className="text-center text-xs text-gray-600 py-8">Нічого не знайдено</p>
          ) : (
            shown.map((r, i) => (
              <button
                key={r.key}
                onMouseEnter={() => setCursor(i)}
                onClick={() => navigate(r.href)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                  i === cursor ? "bg-gray-800" : "hover:bg-gray-800/60",
                )}
              >
                <div className={cn("p-1.5 rounded-lg shrink-0", i === cursor ? "bg-gray-700" : "bg-gray-800")}>
                  <r.Icon size={13} className={i === cursor ? "text-emerald-400" : "text-gray-500"} />
                </div>
                <div className="min-w-0">
                  <p className={cn("text-sm font-medium truncate", i === cursor ? "text-white" : "text-gray-300")}>{r.label}</p>
                  <p className="text-xs text-gray-600 truncate">{r.sub}</p>
                </div>
                {i === cursor && (
                  <CornerDownLeft size={12} className="text-gray-600 ml-auto shrink-0" />
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="border-t border-gray-800 px-4 py-2 flex items-center gap-3 text-[10px] text-gray-600">
          <span className="flex items-center gap-1"><kbd className="bg-gray-800 rounded px-1">↑↓</kbd> вибір</span>
          <span className="flex items-center gap-1"><kbd className="bg-gray-800 rounded px-1">↵</kbd> відкрити</span>
          <span className="flex items-center gap-1"><kbd className="bg-gray-800 rounded px-1">Esc</kbd> закрити</span>
        </div>
      </div>
    </div>
  );
}
