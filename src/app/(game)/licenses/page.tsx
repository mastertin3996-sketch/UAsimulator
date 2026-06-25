"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FileCheck2, FileWarning, FileX, RefreshCw,
  Loader2, CheckCircle2, AlertTriangle, XCircle,
  Building2, Clock, BadgeCheck,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = undefined;

// ─── Types ───────────────────────────────────────────────────────────────────

interface LicenseItem {
  enterpriseId  : string;
  enterpriseName: string;
  enterpriseType: string;
  licenseType   : string;
  licenseName   : string;
  fee           : number;
  durationTicks : number;
  licenseId     : string | null;
  status        : "NONE" | "ACTIVE" | "EXPIRING_SOON" | "EXPIRED";
  expiresAtTick : number | null;
  ticksLeft     : number | null;
  currentTick   : number;
}

interface PageData {
  items      : LicenseItem[];
  cashBalance: number;
  currentTick: number;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<LicenseItem["status"], {
  Icon: React.FC<{ size?: number; className?: string }>;
  label: string;
  color: string;
  bg   : string;
}> = {
  ACTIVE       : { Icon: CheckCircle2,  label: "Активна",          color: "text-emerald-400", bg: "bg-emerald-950/50" },
  EXPIRING_SOON: { Icon: AlertTriangle, label: "Спливає незабаром", color: "text-amber-400",   bg: "bg-amber-950/50"   },
  EXPIRED      : { Icon: XCircle,       label: "Прострочена",       color: "text-red-400",     bg: "bg-red-950/50"     },
  NONE         : { Icon: FileX,         label: "Відсутня",          color: "text-gray-400",    bg: "bg-gray-800/60"    },
};

// ─── Card ─────────────────────────────────────────────────────────────────────

function LicenseCard({
  item,
  onRenew,
  busy,
}: {
  item   : LicenseItem;
  onRenew: (item: LicenseItem) => void;
  busy   : boolean;
}) {
  const cfg     = STATUS_CONFIG[item.status];
  const needsBuy = item.status === "NONE" || item.status === "EXPIRED";
  const btnLabel = needsBuy ? "Придбати" : "Продовжити";

  return (
    <div className={cn(
      "rounded-xl border p-4 space-y-3 transition-colors",
      item.status === "ACTIVE"         && "border-gray-800 bg-gray-900",
      item.status === "EXPIRING_SOON"  && "border-amber-800/60 bg-amber-950/20",
      item.status === "EXPIRED"        && "border-red-800/60 bg-red-950/20",
      item.status === "NONE"           && "border-gray-700 bg-gray-900/60",
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 size={16} className="text-gray-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{item.enterpriseName}</p>
            <p className="text-xs text-gray-500">{item.licenseName}</p>
          </div>
        </div>
        <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium shrink-0", cfg.bg, cfg.color)}>
          <cfg.Icon size={12} />
          {cfg.label}
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-gray-800/60 rounded-lg px-3 py-2">
          <p className="text-gray-500 mb-0.5">Вартість</p>
          <p className="text-white font-mono font-semibold">₴{formatNumber(item.fee)}</p>
        </div>
        <div className="bg-gray-800/60 rounded-lg px-3 py-2">
          <p className="text-gray-500 mb-0.5">Дія (тіки)</p>
          <p className="text-white font-mono font-semibold">{item.durationTicks} тіків</p>
        </div>
        {item.expiresAtTick !== null && (
          <div className="bg-gray-800/60 rounded-lg px-3 py-2 col-span-2">
            <p className="text-gray-500 mb-0.5">Спливає</p>
            <p className={cn("font-mono font-semibold", item.ticksLeft !== null && item.ticksLeft <= 5 ? "text-amber-400" : "text-white")}>
              Тік #{item.expiresAtTick}
              {item.ticksLeft !== null && (
                <span className="text-gray-400 font-normal ml-1">
                  ({item.ticksLeft > 0 ? `ще ${item.ticksLeft}` : "прострочено"})
                </span>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Action */}
      <Button
        size="sm"
        className={cn(
          "w-full text-xs",
          needsBuy
            ? "bg-blue-600 hover:bg-blue-500 text-white"
            : item.status === "EXPIRING_SOON"
            ? "bg-amber-600 hover:bg-amber-500 text-white"
            : "bg-gray-700 hover:bg-gray-600 text-white",
        )}
        onClick={() => onRenew(item)}
        disabled={busy}
      >
        {busy
          ? <Loader2 size={13} className="animate-spin mr-1" />
          : item.status === "ACTIVE"
          ? <RefreshCw size={13} className="mr-1" />
          : <FileCheck2 size={13} className="mr-1" />
        }
        {btnLabel} — ₴{formatNumber(item.fee)}
      </Button>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function LicensesPage() {
  const [data,    setData]    = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId,  setBusyId]  = useState<string | null>(null);
  const [msg,     setMsg]     = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/licenses")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRenew(item: LicenseItem) {
    setBusyId(item.enterpriseId);
    setMsg(null);
    const res  = await fetch("/api/licenses", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ enterpriseId: item.enterpriseId, licenseType: item.licenseType }),
    });
    const d = await res.json();
    setBusyId(null);
    if (res.ok) {
      const action = d.renewed ? "продовжено" : "придбано";
      setMsg({ ok: true, text: `Ліцензію ${item.licenseName} ${action}. Спливає: тік #${d.expiresAtTick}` });
      window.dispatchEvent(new CustomEvent("game:balance"));
      load();
    } else {
      setMsg({ ok: false, text: d.error ?? "Помилка" });
    }
  }

  const expiring = data?.items.filter((i) => i.status === "EXPIRING_SOON" || i.status === "EXPIRED") ?? [];
  const rest     = data?.items.filter((i) => i.status === "ACTIVE" || i.status === "NONE") ?? [];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <BadgeCheck size={22} className="text-blue-400" /> Ліцензії
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Управління дозволами підприємств</p>
        </div>
        {data && (
          <div className="text-right">
            <p className="text-xs text-gray-500">Поточний тік</p>
            <p className="text-sm font-mono text-gray-300">#{data.currentTick}</p>
          </div>
        )}
      </div>

      {/* Balance */}
      {data && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-gray-400">Доступний баланс</span>
          <span className="text-sm font-mono font-semibold text-white">₴{formatNumber(Math.round(data.cashBalance))}</span>
        </div>
      )}

      {/* Message */}
      {msg && (
        <div className={cn(
          "rounded-xl border px-4 py-3 text-sm flex items-center gap-2",
          msg.ok ? "border-emerald-800 bg-emerald-950/40 text-emerald-300" : "border-red-800 bg-red-950/40 text-red-300",
        )}>
          {msg.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          {msg.text}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
        </div>
      )}

      {/* Empty */}
      {!loading && data?.items.length === 0 && (
        <div className="py-16 text-center space-y-2">
          <FileCheck2 size={32} className="text-gray-700 mx-auto" />
          <p className="text-gray-500 text-sm">Жодне з ваших підприємств не потребує ліцензій</p>
          <p className="text-gray-600 text-xs">Ліцензії потрібні для: ферм, харчових заводів, текстильних фабрик та магазинів</p>
        </div>
      )}

      {/* Urgent section */}
      {!loading && expiring.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-amber-400" />
            <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide">Потребують уваги</h2>
          </div>
          {expiring.map((item) => (
            <LicenseCard
              key={item.enterpriseId}
              item={item}
              onRenew={handleRenew}
              busy={busyId === item.enterpriseId}
            />
          ))}
        </section>
      )}

      {/* Rest */}
      {!loading && rest.length > 0 && (
        <section className="space-y-3">
          {expiring.length > 0 && (
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Інші</h2>
          )}
          {rest.map((item) => (
            <LicenseCard
              key={item.enterpriseId}
              item={item}
              onRenew={handleRenew}
              busy={busyId === item.enterpriseId}
            />
          ))}
        </section>
      )}
    </div>
  );
}
