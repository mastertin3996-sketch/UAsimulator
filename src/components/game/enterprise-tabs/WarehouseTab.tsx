"use client";

import { useEffect, useState } from "react";
import type { EnterpriseData } from "@/components/game/EnterpriseDetailClient";

// Дзеркалить WarehouseRentalService.HANDLING_SKUS / HANDLING_PROFS (Wave 3) — суто читання, без змін економіки.
const HANDLING_SKUS = new Set(["EQ-RACKING", "EQ-FORKLIFT", "EQ-WMS", "EQ-CLIMATE", "EQ-COLDROOM"]);
const HANDLING_PROFS = new Set(["WAREHOUSE_MANAGER", "FORKLIFT_OPERATOR", "INVENTORY_CLERK"]);
const THREE_PL_BASE = 500;
const THREE_PL_CAP = 10_000;

interface OwnOffer {
  id: string; enterpriseName: string; pricePerTick: number; capacityKg: number; tenantCount: number;
}

export default function WarehouseTab({ enterprise }: { enterprise: EnterpriseData }) {
  const [ownOffer, setOwnOffer] = useState<OwnOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = () => {
    setLoading(true);
    setLoadError(false);
    fetch("/api/warehouse")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const offer = (d?.offers ?? []).find((o: { isOwnOffer: boolean; enterpriseName: string }) => o.isOwnOffer && o.enterpriseName === enterprise.name);
        setOwnOffer(offer ?? null);
      })
      .catch(err => { console.error("WarehouseTab: offers fetch failed", err); setLoadError(true); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [enterprise.id]);

  const handlingUnits = enterprise.workshops.reduce((sum, w) =>
    sum + w.equipment.filter(eq => !eq.isBroken && eq.wearAndTear < 1.0 && eq.sku && HANDLING_SKUS.has(eq.sku)).length, 0);
  const handlingStaff = enterprise.employees.filter(e => !e.isOnStrike && HANDLING_PROFS.has(e.profession)).length;
  const is3plActive = handlingUnits > 0 && handlingStaff > 0;
  const staffFactor = 1 + Math.min(handlingStaff, 4) * 0.15;
  const est3plIncome = is3plActive
    ? Math.min(Math.round(THREE_PL_BASE * Math.min(handlingUnits, 5) * staffFactor), THREE_PL_CAP)
    : 0;

  return (
    <div className="space-y-4 p-1">
      {loadError && (
        <div className="rounded-lg border border-red-800/40 bg-red-950/10 px-3 py-2 text-xs text-red-400 flex items-center justify-between gap-2">
          <span>⚠ Не вдалося завантажити дані оренди.</span>
          <button onClick={load} className="underline hover:text-red-300 shrink-0">Повторити</button>
        </div>
      )}

      {/* 3PL passive income status */}
      <div className={`rounded-lg border p-3 space-y-2 ${is3plActive ? "border-emerald-800/40 bg-emerald-950/10" : "border-gray-800 bg-gray-900"}`}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider">3PL-послуги (пасивний дохід)</p>
          <span className={`text-sm font-bold ${is3plActive ? "text-emerald-400" : "text-gray-500"}`}>
            {is3plActive ? `+₴${est3plIncome.toLocaleString("uk-UA")}/тік` : "Неактивно"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className={`rounded px-2 py-1.5 ${handlingUnits > 0 ? "bg-emerald-950/30 text-emerald-400" : "bg-gray-800 text-gray-500"}`}>
            {handlingUnits > 0 ? "✓" : "✗"} Техніка: {handlingUnits} од. (EQ-RACKING/FORKLIFT/WMS/CLIMATE/COLDROOM)
          </div>
          <div className={`rounded px-2 py-1.5 ${handlingStaff > 0 ? "bg-emerald-950/30 text-emerald-400" : "bg-gray-800 text-gray-500"}`}>
            {handlingStaff > 0 ? "✓" : "✗"} Персонал: {handlingStaff} (Завідувач/Оператор навантажувача/Комірник)
          </div>
        </div>
        {!is3plActive && (
          <p className="text-xs text-gray-600">Потрібні і техніка, і профільний персонал одночасно — інакше дохід 0.</p>
        )}
      </div>

      {/* Rental offer status */}
      <div className="rounded-lg border border-blue-900/40 bg-blue-950/10 p-3 space-y-2">
        <p className="text-xs font-semibold text-blue-400">Оренда складу іншим гравцям</p>
        {loading ? (
          <p className="text-xs text-gray-600">Завантаження...</p>
        ) : ownOffer ? (
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded bg-gray-800 py-1.5">
              <p className="text-gray-500">Ціна</p>
              <p className="font-semibold text-white">₴{ownOffer.pricePerTick.toLocaleString("uk-UA")}/тік</p>
            </div>
            <div className="rounded bg-gray-800 py-1.5">
              <p className="text-gray-500">Ємність</p>
              <p className="font-semibold text-white">{ownOffer.capacityKg.toLocaleString("uk-UA")} кг</p>
            </div>
            <div className="rounded bg-gray-800 py-1.5">
              <p className="text-gray-500">Орендарів</p>
              <p className="font-semibold text-emerald-400">{ownOffer.tenantCount}</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-600">Немає активної пропозиції оренди для цього складу.</p>
        )}
        <a href="/warehouse" className="inline-block text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2">
          {ownOffer ? "Керувати пропозицією →" : "Здати склад в оренду →"}
        </a>
      </div>
    </div>
  );
}
