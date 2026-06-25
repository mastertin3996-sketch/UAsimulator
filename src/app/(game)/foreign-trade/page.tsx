"use client";

import { useEffect, useState, useCallback } from "react";
import { Globe, TrendingUp, TrendingDown, Minus, ArrowRightLeft, Ship, Loader2, RefreshCw, PackageOpen } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function formatUAH(n: number) { return `₴${formatNumber(Math.round(n))}`; }
function formatUSD(n: number) { return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

const COMMODITY_LABELS: Record<string, string> = {
  WHEAT: "Пшениця", CORN: "Кукурудза", SUNFLOWER_OIL: "Соняшникова олія",
  IRON_ORE: "Залізна руда", STEEL_BILLETS: "Сталеві заготовки",
  DIESEL_FUEL: "Дизельне пальне", HIGH_TECH_MACHINERY: "Техніка (hi-tech)",
};

type Ticker = { commodity: string; currentUsd: number; baselineUsd: number; changeDay: number };
type Decl   = { id: string; type: string; status: string; commodity: string; quantity: number; usdValue: number; uahValue: number; createdAt: string; clearedAt: string | null };
type Ent    = { id: string; name: string; inventory: { sku: string; nameUa: string; unit: string; quantity: number }[] };
type City   = { id: string; nameUa: string };

type Data = {
  fxRate: number; cashBalance: number; balanceUsd: number;
  cities: City[];
  tickers: Ticker[]; declarations: Decl[]; enterprises: Ent[];
};

export default function ForeignTradePage() {
  const [data,      setData]      = useState<Data | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [tab,        setTab]        = useState<"export" | "import" | "fx" | "history">("export");
  const [submitting, setSubmitting] = useState(false);
  const [msg,        setMsg]        = useState<{ ok: boolean; text: string } | null>(null);

  // Export form
  const [exportEnt,  setExportEnt]  = useState("");
  const [exportComm, setExportComm] = useState("");
  const [exportQty,  setExportQty]  = useState("");

  // Import form
  const [importCity, setImportCity] = useState("");
  const [importComm, setImportComm] = useState("");
  const [importQty,  setImportQty]  = useState("");

  // FX form
  const [fxDir,    setFxDir]    = useState<"UAH_TO_USD" | "USD_TO_UAH">("UAH_TO_USD");
  const [fxAmount, setFxAmount] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/foreign-trade")
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function submit(action: "export" | "import" | "fx") {
    setSubmitting(true); setMsg(null);
    let body: Record<string, unknown>;
    if (action === "export") {
      body = { action, enterpriseId: exportEnt, commodity: exportComm, quantity: Number(exportQty) };
    } else if (action === "import") {
      body = { action, cityId: importCity || undefined, commodity: importComm, quantity: Number(importQty) };
    } else {
      body = { action, direction: fxDir, amount: Number(fxAmount) };
    }
    const res = await fetch("/api/foreign-trade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d   = await res.json();
    setSubmitting(false);
    if (!res.ok) { setMsg({ ok: false, text: d.error ?? "Помилка" }); return; }
    if (action === "export") {
      setMsg({ ok: true, text: `Експортну декларацію подано. Очікуваний дохід: ${formatUSD(d.usdValue)}. Кліренс через ~3 тіки.` });
      setExportQty("");
    } else if (action === "import") {
      const dutyText = d.customsPaid
        ? `Мито+ПДВ: ${formatUAH(d.importDutyUah + d.vatUah)} сплачено.`
        : `⚠ Товар заморожено на кордоні — поповніть UAH баланс для сплати мита.`;
      setMsg({ ok: d.customsPaid, text: `Імпорт оформлено: ${formatUSD(d.totalUsd)}. ${dutyText} Доставка через ~3 тіки.` });
      setImportQty("");
    } else {
      setMsg({ ok: true, text: `Обмін виконано: отримано ${formatUSD(d.amountOut)} (курс ${Number(d.effectiveRate).toFixed(4)})` });
      setFxAmount("");
    }
    load();
  }

  if (loading) return (
    <div className="space-y-4">
      {[1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-gray-800 animate-pulse" />)}
    </div>
  );

  if (!data) return <p className="text-red-400">Помилка завантаження</p>;

  const selectedTicker = data.tickers.find(t => t.commodity === exportComm);
  const selectedEnt    = data.enterprises.find(e => e.id === exportEnt);
  const availableQty   = selectedEnt?.inventory.find(i => i.sku === exportComm)?.quantity ?? 0;
  const fxPreview      = fxDir === "UAH_TO_USD"
    ? Number(fxAmount) / (data.fxRate * 1.005)
    : Number(fxAmount) * data.fxRate * 0.995;

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Globe size={20} /> Зовнішня торгівля</h1>
        <p className="text-gray-500 text-sm mt-1">Експорт на світові ринки та обмін валюти</p>
      </div>

      {/* Header stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Баланс UAH</p>
          <p className="text-lg font-bold text-white font-mono">{formatUAH(data.cashBalance)}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Баланс USD</p>
          <p className="text-lg font-bold text-emerald-400 font-mono">{formatUSD(data.balanceUsd)}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Курс USD/UAH</p>
          <p className="text-lg font-bold text-blue-400 font-mono">₴{data.fxRate.toFixed(2)}</p>
        </div>
      </div>

      {/* Tickers */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Світові котирування</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {data.tickers.map(t => {
            const pct = t.baselineUsd > 0 ? ((t.currentUsd - t.baselineUsd) / t.baselineUsd) * 100 : 0;
            const Icon = t.changeDay > 0.001 ? TrendingUp : t.changeDay < -0.001 ? TrendingDown : Minus;
            const color = t.changeDay > 0.001 ? "text-emerald-400" : t.changeDay < -0.001 ? "text-red-400" : "text-gray-500";
            return (
              <div key={t.commodity} className={cn("rounded-xl border bg-gray-900 px-3 py-2.5 cursor-pointer transition-all",
                exportComm === t.commodity ? "border-emerald-500/50 bg-emerald-950/10" : "border-gray-800 hover:border-gray-700"
              )} onClick={() => { setExportComm(t.commodity); setTab("export"); }}>
                <p className="text-[10px] text-gray-500 truncate">{COMMODITY_LABELS[t.commodity] ?? t.commodity}</p>
                <p className="text-sm font-bold text-white font-mono">{formatUSD(t.currentUsd)}/т</p>
                <div className={cn("flex items-center gap-0.5 text-[10px]", color)}>
                  <Icon size={9} /> {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800">
        {[
          { key: "export"  as const, label: "Експорт",    icon: Ship },
          { key: "import"  as const, label: "Імпорт",     icon: PackageOpen },
          { key: "fx"      as const, label: "Обмін валют", icon: ArrowRightLeft },
          { key: "history" as const, label: `Декларації (${data.declarations.length})`, icon: Globe },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn("flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-all border-b-2 -mb-px",
              tab === key ? "text-emerald-400 border-emerald-400" : "text-gray-500 border-transparent hover:text-white"
            )}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {msg && (
        <div className={cn("px-4 py-3 rounded-lg text-sm border", msg.ok ? "border-emerald-700/40 bg-emerald-950/30 text-emerald-400" : "border-red-700/40 bg-red-950/30 text-red-400")}>
          {msg.text}
        </div>
      )}

      {/* Export tab */}
      {tab === "export" && (
        <div className="space-y-4">
          <p className="text-xs text-gray-500">Оберіть підприємство, товар і кількість. Після кліренсу (~3 тіки) USD надійде на рахунок.</p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Підприємство-відправник</label>
              <select value={exportEnt} onChange={e => setExportEnt(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none">
                <option value="">Оберіть підприємство…</option>
                {data.enterprises.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Товар</label>
              <select value={exportComm} onChange={e => setExportComm(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none">
                <option value="">Оберіть товар…</option>
                {data.tickers.map(t => <option key={t.commodity} value={t.commodity}>{COMMODITY_LABELS[t.commodity] ?? t.commodity} — {formatUSD(t.currentUsd)}/т</option>)}
              </select>
              {selectedEnt && exportComm && (
                <p className="text-[10px] text-gray-500 mt-1">На складі: {formatNumber(availableQty)} т</p>
              )}
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Кількість (т)</label>
              <input type="number" min={1} max={availableQty} value={exportQty} onChange={e => setExportQty(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none"
                placeholder="0" />
              {selectedTicker && exportQty && Number(exportQty) > 0 && (
                <p className="text-[10px] text-emerald-400 mt-1">
                  Очікуваний дохід: {formatUSD(selectedTicker.currentUsd * Number(exportQty) * 0.98)} (після мита 2%)
                </p>
              )}
            </div>
          </div>
          <Button onClick={() => submit("export")} disabled={submitting || !exportEnt || !exportComm || !exportQty}>
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <Ship size={13} />}
            Подати декларацію
          </Button>
        </div>
      )}

      {/* Import tab */}
      {tab === "import" && (
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Закупівля товарів за кордоном за USD. Мито 10% + ПДВ 20% від митної вартості сплачуються в UAH.
            Після кліренсу (~3 тіки) товар надходить на склад у вашому місті.
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Місто доставки (необов'язково)</label>
              <select value={importCity} onChange={e => setImportCity(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none">
                <option value="">Загальний склад гравця</option>
                {(data.cities ?? []).map(c => <option key={c.id} value={c.id}>{c.nameUa}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Товар</label>
              <select value={importComm} onChange={e => setImportComm(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none">
                <option value="">Оберіть товар…</option>
                {data.tickers.map(t => <option key={t.commodity} value={t.commodity}>{COMMODITY_LABELS[t.commodity] ?? t.commodity} — {formatUSD(t.currentUsd)}/т</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Кількість (т)</label>
              <input type="number" min={1} value={importQty} onChange={e => setImportQty(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none"
                placeholder="0" />
              {(() => {
                const ticker = data.tickers.find(t => t.commodity === importComm);
                const qty    = Number(importQty);
                if (!ticker || qty <= 0) return null;
                const totalUsd   = ticker.currentUsd * qty;
                const valUah     = totalUsd * data.fxRate;
                const dutyUah    = valUah * 0.10;
                const vatUah     = (valUah + dutyUah) * 0.20;
                const totalCosts = dutyUah + vatUah;
                return (
                  <div className="mt-2 rounded-lg bg-gray-800/50 border border-gray-700 px-3 py-2 space-y-1 text-[11px]">
                    <div className="flex justify-between"><span className="text-gray-500">Ціна товару (USD)</span><span className="font-mono text-white">{formatUSD(totalUsd)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Ввізне мито (10%)</span><span className="font-mono text-red-400">{formatUAH(dutyUah)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">ПДВ при імпорті (20%)</span><span className="font-mono text-red-400">{formatUAH(vatUah)}</span></div>
                    <div className="flex justify-between border-t border-gray-700 pt-1 mt-1"><span className="text-gray-400 font-medium">Разом UAH витрат</span><span className="font-mono text-orange-400 font-bold">{formatUAH(totalCosts)}</span></div>
                    {data.cashBalance < totalCosts && (
                      <p className="text-red-400">⚠ Недостатньо UAH для сплати митниці. Товар буде заморожено на кордоні.</p>
                    )}
                    {data.balanceUsd < totalUsd && (
                      <p className="text-red-400">⚠ Недостатньо USD. Є: {formatUSD(data.balanceUsd)}</p>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
          <Button onClick={() => submit("import")} disabled={submitting || !importComm || !importQty || Number(importQty) <= 0}>
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <PackageOpen size={13} />}
            Оформити імпорт
          </Button>
        </div>
      )}

      {/* FX tab */}
      {tab === "fx" && (
        <div className="space-y-4">
          <p className="text-xs text-gray-500">Конвертація між UAH та USD за міжбанківським курсом з комісією 0.5%.</p>
          <div className="space-y-3">
            <div className="flex gap-2">
              {(["UAH_TO_USD", "USD_TO_UAH"] as const).map(dir => (
                <button key={dir} onClick={() => setFxDir(dir)}
                  className={cn("flex-1 py-2 rounded-lg text-sm font-medium border transition-all",
                    fxDir === dir ? "border-emerald-500 bg-emerald-950/30 text-emerald-400" : "border-gray-700 text-gray-500 hover:text-white"
                  )}>
                  {dir === "UAH_TO_USD" ? "UAH → USD" : "USD → UAH"}
                </button>
              ))}
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">
                {fxDir === "UAH_TO_USD" ? "Сума UAH" : "Сума USD"}
              </label>
              <input type="number" min={1} value={fxAmount} onChange={e => setFxAmount(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none"
                placeholder="0" />
              {fxAmount && Number(fxAmount) > 0 && (
                <p className="text-[10px] text-emerald-400 mt-1">
                  Отримаєте ≈ {fxDir === "UAH_TO_USD" ? formatUSD(fxPreview) : formatUAH(fxPreview)}
                  {" "}(курс {data.fxRate.toFixed(2)}, комісія 0.5%)
                </p>
              )}
            </div>
          </div>
          <Button onClick={() => submit("fx")} disabled={submitting || !fxAmount}>
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <ArrowRightLeft size={13} />}
            Конвертувати
          </Button>
        </div>
      )}

      {/* History tab */}
      {tab === "history" && (
        <div className="space-y-2">
          {data.declarations.length === 0 ? (
            <div className="py-12 text-center text-gray-600 text-sm">Декларацій ще немає</div>
          ) : data.declarations.map(d => (
            <div key={d.id} className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 flex items-center gap-3">
              <div className={cn("text-[10px] font-bold px-2 py-0.5 rounded shrink-0",
                d.status === "CLEARED" ? "bg-emerald-950 text-emerald-400" : "bg-amber-950 text-amber-400"
              )}>
                {d.status === "CLEARED" ? "КЛІРЕНС" : "В ОБРОБЦІ"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white">{COMMODITY_LABELS[d.commodity] ?? d.commodity} · {formatNumber(d.quantity)} т</p>
                <p className="text-xs text-gray-500">{d.type === "EXPORT" ? "Експорт" : "Імпорт"} · {new Date(d.createdAt).toLocaleDateString("uk")}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-mono text-emerald-400">{formatUSD(d.usdValue)}</p>
                <p className="text-[10px] text-gray-500">{formatUAH(d.uahValue)}</p>
              </div>
            </div>
          ))}
          <button onClick={load} className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-400 transition-colors mx-auto pt-2">
            <RefreshCw size={10} /> Оновити
          </button>
        </div>
      )}
    </div>
  );
}
