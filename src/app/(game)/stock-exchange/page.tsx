"use client";

import { useEffect, useState, useCallback } from "react";
import {
  CandlestickChart, TrendingUp, TrendingDown, X, Loader2,
  AlertCircle, Wallet, BarChart2, CheckCircle2,
} from "lucide-react";
import { cn, formatUAH } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// ─── Types ─────────────────────────────────────────────────────────────────

interface Ticker {
  id: string; symbol: string; companyName: string; isOwn: boolean;
  totalSharesIssued: number; freeFloatShares: number;
  lastTradedPriceUah: number; marketCapUah: number; ipoExecutedAtTick: number;
}

interface MyOrder {
  id: string; tickerId: string; symbol: string; type: "BUY" | "SELL";
  pricePerShareUah: number; quantity: number; filledQuantity: number;
  status: string; createdAtTick: number;
}

interface MyShare { tickerId: string; symbol: string; sharesCount: number; lastPriceUah: number; value: number; }

interface MyTicker {
  id: string; symbol: string; totalSharesIssued: number; freeFloatShares: number;
  lastTradedPriceUah: number; marketCapUah: number; ipoExecutedAtTick: number; isActive: boolean;
}

interface StockData {
  player: { cashBalance: number; companyValuationUah: number; isBankrupt: boolean; companyName: string };
  myTicker: MyTicker | null;
  tickers: Ticker[];
  myOrders: MyOrder[];
  myShares: MyShare[];
  portfolioValue: number;
}

// ─── IPO Modal ──────────────────────────────────────────────────────────────

function IpoModal({
  valuation, cashBalance, onDone, onClose,
}: { valuation: number; cashBalance: number; onDone: () => void; onClose: () => void }) {
  const [symbol,  setSymbol]  = useState("");
  const [shares,  setShares]  = useState(1_000_000);
  const [price,   setPrice]   = useState(Math.max(1, Math.round(valuation / 1_000_000)));
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState("");

  const impliedCap = shares * price;

  async function launch() {
    setSaving(true); setErr("");
    const res = await fetch("/api/stock-exchange/ipo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: symbol.toUpperCase(), sharesToIssue: shares, initialPriceUah: price }),
    });
    const d = await res.json();
    if (!res.ok) { setErr(d.error ?? "Помилка"); setSaving(false); return; }
    onDone();
  }

  const meetsValuation = valuation >= 10_000_000;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="rounded-2xl border border-gray-800 bg-gray-950 p-6 w-full max-w-md space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">Первинне публічне розміщення (IPO)</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={16} /></button>
        </div>

        {!meetsValuation && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-xs">
            <AlertCircle size={12} /> Оцінка компанії ₴{(valuation/1e6).toFixed(1)}M нижча за мінімум ₴10M для IPO
          </div>
        )}

        {err && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{err}</p>}

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Тікер (символ, до 8 знаків, A-Z0-9_)</label>
            <input
              type="text" maxLength={8} value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
              placeholder="MYCO"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <div className="flex justify-between mb-1">
              <label className="text-xs text-gray-500">Кількість акцій</label>
              <span className="text-xs font-mono text-white">{shares.toLocaleString()}</span>
            </div>
            <input type="range" min={100_000} max={10_000_000} step={100_000}
              value={shares} onChange={e => setShares(Number(e.target.value))}
              className="w-full accent-emerald-500" />
          </div>

          <div>
            <div className="flex justify-between mb-1">
              <label className="text-xs text-gray-500">Початкова ціна (UAH / акція)</label>
              <span className="text-xs font-mono text-white">{formatUAH(price)}</span>
            </div>
            <input type="range" min={0.01} max={1000} step={0.01}
              value={price} onChange={e => setPrice(Number(e.target.value))}
              className="w-full accent-emerald-500" />
          </div>

          <div className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Implied cap</span>
              <span className="font-mono text-white">{formatUAH(impliedCap)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Акції засновника (60%)</span>
              <span className="font-mono text-emerald-400">{Math.floor(shares * 0.6).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Float (40%)</span>
              <span className="font-mono text-blue-400">{Math.ceil(shares * 0.4).toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>Скасувати</Button>
          <Button className="flex-1" onClick={launch} disabled={saving || !symbol || !meetsValuation}>
            {saving ? <Loader2 size={13} className="animate-spin mr-1" /> : null}
            Провести IPO
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Order Modal ────────────────────────────────────────────────────────────

function OrderModal({
  ticker, cashBalance, mySharesCount, onDone, onClose,
}: {
  ticker: Ticker; cashBalance: number; mySharesCount: number;
  onDone: () => void; onClose: () => void;
}) {
  const [type,     setType]    = useState<"BUY" | "SELL">("BUY");
  const [qty,      setQty]     = useState(100);
  const [price,    setPrice]   = useState(ticker.lastTradedPriceUah);
  const [saving,   setSaving]  = useState(false);
  const [err,      setErr]     = useState("");

  const total = qty * price;
  const canBuy  = type === "BUY"  && cashBalance >= total;
  const canSell = type === "SELL" && mySharesCount >= qty;

  async function place() {
    setSaving(true); setErr("");
    const res = await fetch("/api/stock-exchange/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tickerId: ticker.id, type, quantity: qty, pricePerShareUah: price }),
    });
    const d = await res.json();
    if (!res.ok) { setErr(d.error ?? "Помилка"); setSaving(false); return; }
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="rounded-2xl border border-gray-800 bg-gray-950 p-6 w-full max-w-md space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">Ордер · {ticker.symbol}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={16} /></button>
        </div>

        {err && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{err}</p>}

        <div className="grid grid-cols-2 gap-2">
          {(["BUY", "SELL"] as const).map(t => (
            <button key={t} onClick={() => setType(t)}
              className={cn(
                "py-2.5 rounded-lg border text-sm font-medium transition-all",
                type === t && t === "BUY"  ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400" : "",
                type === t && t === "SELL" ? "border-red-500/60 bg-red-500/10 text-red-400" : "",
                type !== t ? "border-gray-800 bg-gray-900 text-gray-400 hover:text-white" : "",
              )}>
              {t === "BUY" ? "Купити" : "Продати"}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div>
            <div className="flex justify-between mb-1">
              <label className="text-xs text-gray-500">Кількість акцій</label>
              <span className="text-xs font-mono text-white">{qty.toLocaleString()}</span>
            </div>
            <input type="number" min={1} value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-emerald-500" />
            {type === "SELL" && <p className="text-[10px] text-gray-500 mt-0.5">У вас: {mySharesCount.toLocaleString()} акцій</p>}
          </div>

          <div>
            <div className="flex justify-between mb-1">
              <label className="text-xs text-gray-500">Ціна за акцію (UAH)</label>
              <span className="text-xs font-mono text-white">{formatUAH(price)}</span>
            </div>
            <input type="number" min={0.01} step={0.01} value={price}
              onChange={e => setPrice(Math.max(0.01, parseFloat(e.target.value) || 0.01))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-emerald-500" />
            <p className="text-[10px] text-gray-500 mt-0.5">Остання ціна: {formatUAH(ticker.lastTradedPriceUah)}</p>
          </div>

          <div className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3 flex justify-between">
            <span className="text-sm text-gray-400">Сума угоди</span>
            <span className={cn("text-sm font-mono font-semibold", type === "BUY" ? "text-red-400" : "text-emerald-400")}>
              {type === "BUY" ? "-" : "+"}{formatUAH(total)}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>Скасувати</Button>
          <Button
            className={cn("flex-1", type === "SELL" ? "bg-red-600 hover:bg-red-500" : "")}
            onClick={place}
            disabled={saving || (type === "BUY" ? !canBuy : !canSell)}
          >
            {saving ? <Loader2 size={13} className="animate-spin mr-1" /> : null}
            {type === "BUY" ? "Купити" : "Продати"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Dividend Modal ─────────────────────────────────────────────────────────

function DividendModal({
  cashBalance, totalShares, onDone, onClose,
}: { cashBalance: number; totalShares: number; onDone: () => void; onClose: () => void }) {
  const [pool,   setPool]  = useState(Math.min(100_000, cashBalance));
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState("");

  const dps = totalShares > 0 ? pool / totalShares : 0;

  async function pay() {
    setSaving(true); setErr("");
    const res = await fetch("/api/stock-exchange/dividends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ totalPoolUah: pool }),
    });
    const d = await res.json();
    if (!res.ok) { setErr(d.error ?? "Помилка"); setSaving(false); return; }
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="rounded-2xl border border-gray-800 bg-gray-950 p-6 w-full max-w-md space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">Виплата дивідендів</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={16} /></button>
        </div>
        {err && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{err}</p>}

        <div className="space-y-3">
          <div>
            <div className="flex justify-between mb-1">
              <label className="text-xs text-gray-500">Пул дивідендів (UAH)</label>
              <span className="text-xs font-mono text-white">{formatUAH(pool)}</span>
            </div>
            <input type="range" min={1000} max={Math.max(1000, cashBalance)} step={1000}
              value={pool} onChange={e => setPool(Number(e.target.value))}
              className="w-full accent-emerald-500" />
          </div>

          <div className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">DPS (на акцію)</span>
              <span className="font-mono text-emerald-400">₴{dps.toFixed(4)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Всього акцій</span>
              <span className="font-mono text-white">{totalShares.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>Скасувати</Button>
          <Button className="flex-1" onClick={pay} disabled={saving || pool > cashBalance}>
            {saving ? <Loader2 size={13} className="animate-spin mr-1" /> : null}
            Виплатити дивіденди
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function StockExchangePage() {
  const [data,    setData]    = useState<StockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<"market" | "portfolio" | "orders" | "mystock">("market");
  const [ipoModal,      setIpoModal]      = useState(false);
  const [orderTicker,   setOrderTicker]   = useState<Ticker | null>(null);
  const [dividendModal, setDividendModal] = useState(false);
  const [cancelling,    setCancelling]    = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/stock-exchange")
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function cancelOrder(orderId: string) {
    setCancelling(orderId);
    await fetch(`/api/stock-exchange/order/${orderId}`, { method: "DELETE" });
    setCancelling(null);
    load();
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-8 w-56 rounded bg-gray-800 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-gray-800 animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!data) return <div className="py-16 text-center text-gray-500">Помилка завантаження</div>;

  const { player, myTicker, tickers, myOrders, myShares, portfolioValue } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <CandlestickChart size={20} className="text-amber-400" /> Фондова біржа
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">IPO, торгівля акціями та дивіденди</p>
        </div>
        <div className="flex gap-2">
          {myTicker ? (
            <Button variant="outline" onClick={() => setDividendModal(true)}>
              <BarChart2 size={14} /> Виплатити дивіденди
            </Button>
          ) : (
            <Button onClick={() => setIpoModal(true)}>
              <TrendingUp size={14} /> Провести IPO
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Баланс", value: formatUAH(player.cashBalance), color: "text-white" },
          { label: "Портфель акцій", value: formatUAH(portfolioValue), color: "text-emerald-400" },
          { label: "Тікерів на ринку", value: tickers.length.toString(), color: "text-amber-400" },
          { label: "Активних ордерів", value: myOrders.length.toString(), color: "text-blue-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</p>
            <p className={cn("text-lg font-bold font-mono mt-0.5", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* My ticker status */}
      {myTicker && (
        <div className="flex items-center gap-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <CheckCircle2 size={16} className="text-amber-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">{myTicker.symbol} — ваша компанія на біржі</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Ціна: {formatUAH(myTicker.lastTradedPriceUah)} · Кап.: {formatUAH(myTicker.marketCapUah)} · Float: {(myTicker.freeFloatShares / myTicker.totalSharesIssued * 100).toFixed(1)}%
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800">
        {[
          { key: "market" as const,    label: `Ринок (${tickers.length})` },
          { key: "portfolio" as const, label: `Портфель (${myShares.length})` },
          { key: "orders" as const,    label: `Ордери (${myOrders.length})` },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === key ? "text-amber-400 border-amber-400" : "text-gray-500 border-transparent hover:text-white",
            )}>
            {label}
          </button>
        ))}
      </div>

      {/* Market tab */}
      {tab === "market" && (
        <div className="space-y-2">
          {tickers.length === 0 ? (
            <div className="py-12 text-center">
              <CandlestickChart size={24} className="text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">На біржі поки немає тікерів</p>
              <p className="text-xs text-gray-600 mt-1">Досягніть оцінки ₴10M і проведіть IPO</p>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-900 border-b border-gray-800">
                  <tr>
                    {["Тікер", "Компанія", "Ціна", "Кап.", "Float", ""].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[11px] font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {tickers.map(t => {
                    const mySharesForThis = myShares.find(s => s.tickerId === t.id)?.sharesCount ?? 0;
                    return (
                      <tr key={t.id} className="hover:bg-gray-900/50 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono font-semibold text-amber-400">{t.symbol}</span>
                          {t.isOwn && <span className="ml-1.5 text-[10px] text-gray-500">(ваша)</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-300">{t.companyName}</td>
                        <td className="px-4 py-3 font-mono text-white">{formatUAH(t.lastTradedPriceUah)}</td>
                        <td className="px-4 py-3 font-mono text-gray-300">{formatUAH(t.marketCapUah)}</td>
                        <td className="px-4 py-3 text-gray-400">{(t.freeFloatShares / t.totalSharesIssued * 100).toFixed(1)}%</td>
                        <td className="px-4 py-3">
                          {!t.isOwn && (
                            <Button size="sm" variant="outline" className="text-xs"
                              onClick={() => setOrderTicker(t)}>
                              Торгувати
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Portfolio tab */}
      {tab === "portfolio" && (
        <div className="space-y-3">
          {myShares.length === 0 ? (
            <div className="py-12 text-center">
              <Wallet size={24} className="text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Акцій в портфелі немає</p>
            </div>
          ) : myShares.map(s => (
            <div key={s.tickerId} className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
              <div>
                <p className="font-mono font-semibold text-amber-400">{s.symbol}</p>
                <p className="text-xs text-gray-500">{s.sharesCount.toLocaleString()} акцій × {formatUAH(s.lastPriceUah)}</p>
              </div>
              <div className="text-right">
                <p className="font-mono font-semibold text-white">{formatUAH(s.value)}</p>
                <Button size="sm" variant="outline" className="text-xs mt-1"
                  onClick={() => setOrderTicker(tickers.find(t => t.id === s.tickerId) ?? null)}>
                  Продати
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Orders tab */}
      {tab === "orders" && (
        <div className="space-y-3">
          {myOrders.length === 0 ? (
            <div className="py-12 text-center">
              <BarChart2 size={24} className="text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Активних ордерів немає</p>
            </div>
          ) : myOrders.map(o => (
            <div key={o.id} className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-amber-400">{o.symbol}</span>
                  <span className={cn("text-xs font-medium", o.type === "BUY" ? "text-emerald-400" : "text-red-400")}>
                    {o.type === "BUY" ? "КУПІВЛЯ" : "ПРОДАЖ"}
                  </span>
                  <span className="text-xs text-gray-500">{o.status}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {o.quantity.toLocaleString()} акц. × {formatUAH(o.pricePerShareUah)} ·
                  виконано {o.filledQuantity.toLocaleString()}
                </p>
              </div>
              <Button size="sm" variant="outline" className="text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
                disabled={cancelling === o.id}
                onClick={() => cancelOrder(o.id)}>
                {cancelling === o.id ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {ipoModal && (
        <IpoModal
          valuation={player.companyValuationUah}
          cashBalance={player.cashBalance}
          onDone={() => { setIpoModal(false); load(); }}
          onClose={() => setIpoModal(false)}
        />
      )}
      {orderTicker && (
        <OrderModal
          ticker={orderTicker}
          cashBalance={player.cashBalance}
          mySharesCount={myShares.find(s => s.tickerId === orderTicker.id)?.sharesCount ?? 0}
          onDone={() => { setOrderTicker(null); load(); }}
          onClose={() => setOrderTicker(null)}
        />
      )}
      {dividendModal && myTicker && (
        <DividendModal
          cashBalance={player.cashBalance}
          totalShares={myTicker.totalSharesIssued}
          onDone={() => { setDividendModal(false); load(); }}
          onClose={() => setDividendModal(false)}
        />
      )}
    </div>
  );
}
