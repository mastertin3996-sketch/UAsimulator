"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ShoppingCart, TrendingUp, TrendingDown, Minus, Search,
  CheckCircle2, AlertCircle, Loader2, BookOpen, ArrowDownUp,
  RefreshCw, Clock, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table, TableHead, TableBody, TableRow,
  TableHeader, TableCell, TableEmpty,
} from "@/components/ui/table";
import { CurrencyDisplay } from "@/components/game/CurrencyDisplay";
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";
import { cn, formatNumber } from "@/lib/utils";
import ProductPriceChart from "@/components/game/charts/ProductPriceChart";

// ─── Types ────────────────────────────────────────────────────────────────────

type Offer = {
  id: string; productName: string; unit: string; basePrice: number;
  cityName: string; sellerName: string; sellerRating: number;
  price: number; quantity: number; minOrder: number; quality: number;
  expiresAt: string | null; priceVsBase: number; isNpc?: boolean;
};

type Enterprise = { id: string; name: string; cityName: string };
type InvItem    = { productId: string; product: string; unit: string; quantity: number };
type Product    = { id: string; nameUa: string; unit: string; orderCount: number };

type AskRow = { id: string; price: number; qty: number; quality: number; isMe: boolean; seller: string };
type BidRow = { id: string; price: number; qty: number; qualityMin: number; isMe: boolean; buyer: string };
type TradeRow = { price: number; qty: number; quality: number; executedAt: string };

interface OrderBook {
  asks:     AskRow[];
  bids:     BidRow[];
  trades:   TradeRow[];
  refPrice: number;
  spread:   number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function PriceVsBase({ ratio }: { ratio: number }) {
  const pct = ((ratio - 1) * 100).toFixed(1);
  if (ratio <= 0.9) return <span className="flex items-center gap-1 text-green-400 text-xs"><TrendingDown size={12} />−{Math.abs(Number(pct))}%</span>;
  if (ratio >= 1.1) return <span className="flex items-center gap-1 text-red-400 text-xs"><TrendingUp size={12} />+{pct}%</span>;
  return <span className="flex items-center gap-1 text-gray-500 text-xs"><Minus size={12} />{pct}%</span>;
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)   return `${s}с тому`;
  if (s < 3600) return `${Math.floor(s / 60)}хв тому`;
  return `${Math.floor(s / 3600)}г тому`;
}

// ─── Order Book panel ─────────────────────────────────────────────────────────

interface PricePoint { date: string; avgPrice: number; minPrice: number; maxPrice: number; volume: number; count: number }

function OrderBookPanel() {
  const [products,        setProducts]        = useState<Product[]>([]);
  const [selectedId,      setSelectedId]      = useState("");
  const [book,            setBook]            = useState<OrderBook | null>(null);
  const [loading,         setLoading]         = useState(false);
  const [productsLoading, setProductsLoading] = useState(true);
  const [priceHistory,    setPriceHistory]    = useState<PricePoint[]>([]);
  const [chartLoading,    setChartLoading]    = useState(false);
  const [buyModalOpen,    setBuyModalOpen]    = useState(false);
  const [buyForm,         setBuyForm]         = useState({ quantity: "", price: "", qualityMin: "0", daysValid: "7" });
  const [submitting,      setSubmitting]      = useState(false);
  const [submitMsg,       setSubmitMsg]       = useState<{ ok: boolean; text: string } | null>(null);

  const selectedProduct = products.find((p) => p.id === selectedId);

  useEffect(() => {
    setProductsLoading(true);
    fetch("/api/products")
      .then((r) => r.json())
      .then((d) => {
        setProducts(d.products ?? []);
        const first = (d.products as Product[])?.find((p) => p.orderCount > 0);
        if (first) setSelectedId(first.id);
      })
      .finally(() => setProductsLoading(false));
  }, []);

  const loadBook = useCallback(() => {
    if (!selectedId) return;
    setLoading(true);
    fetch(`/api/market/orderbook?productId=${selectedId}`)
      .then((r) => r.json())
      .then(setBook)
      .finally(() => setLoading(false));
  }, [selectedId]);

  useEffect(() => { loadBook(); }, [loadBook]);

  // Fetch 60-day price history when product changes
  useEffect(() => {
    if (!selectedId) return;
    setChartLoading(true);
    fetch(`/api/analytics/price-history?productId=${selectedId}`)
      .then((r) => r.json())
      .then((d) => setPriceHistory(d.priceHistory ?? []))
      .finally(() => setChartLoading(false));
  }, [selectedId]);

  async function placeBuyOrder(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setSubmitMsg(null);
    const res = await fetch("/api/market/order", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId:  selectedId,
        quantity:   Number(buyForm.quantity),
        price:      Number(buyForm.price),
        qualityMin: Number(buyForm.qualityMin),
        daysValid:  Number(buyForm.daysValid),
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setSubmitMsg({ ok: false, text: data.error ?? "Помилка" }); return; }
    setSubmitMsg({ ok: true, text: "BUY-ордер виставлено! Буде виконано на наступному тіку." });
    setBuyForm({ quantity: "", price: "", qualityMin: "0", daysValid: "7" });
    setTimeout(() => { setBuyModalOpen(false); setSubmitMsg(null); loadBook(); }, 2000);
  }

  const maxAskQty = book?.asks.reduce((s, a) => s + a.qty, 0) || 1;
  const maxBidQty = book?.bids.reduce((s, b) => s + b.qty, 0) || 1;

  const lastTrade = book?.trades[0];

  return (
    <div className="space-y-4">
      {/* Product selector + controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0 max-w-xs">
          {productsLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <div className="relative">
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 pr-8 appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                <option value="">— Оберіть продукт —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nameUa} ({p.orderCount > 0 ? `${p.orderCount} ордери` : "немає ордерів"})
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          )}
        </div>

        <button
          onClick={loadBook}
          disabled={!selectedId || loading}
          className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors disabled:opacity-40"
          title="Оновити"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>

        <Button
          size="sm"
          disabled={!selectedId}
          onClick={() => { setSubmitMsg(null); setBuyModalOpen(true); }}
        >
          <TrendingUp size={14} /> Виставити BID
        </Button>
      </div>

      {!selectedId ? (
        <div className="rounded-xl border border-dashed border-gray-800 py-16 text-center text-gray-500 text-sm">
          Оберіть продукт для перегляду ордер-буку
        </div>
      ) : loading && !book ? (
        <div className="grid lg:grid-cols-2 gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, j) => <Skeleton key={j} className="h-8 w-full" />)}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Stats strip */}
          {book && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
                <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Еталонна ціна</p>
                <p className="text-lg font-bold font-mono text-white">
                  {book.refPrice > 0 ? `₴${formatNumber(book.refPrice)}` : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
                <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Спред</p>
                <p className="text-lg font-bold font-mono text-amber-400">
                  {book.spread != null ? (book.spread > 0 ? `₴${book.spread.toFixed(2)}` : "≤0") : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
                <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Остання угода</p>
                {lastTrade ? (
                  <>
                    <p className="text-lg font-bold font-mono text-emerald-400">₴{Number(lastTrade.price).toFixed(2)}</p>
                    <p className="text-[10px] text-gray-600">{timeAgo(lastTrade.executedAt)}</p>
                  </>
                ) : <p className="text-sm text-gray-600">—</p>}
              </div>
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
                <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Угод за 20</p>
                <p className="text-lg font-bold text-white">{book?.trades.length ?? 0}</p>
              </div>
            </div>
          )}

          {/* Price history chart */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-300">Історія цін (60 днів)</p>
              {chartLoading && <span className="text-xs text-gray-600 animate-pulse">завантаження…</span>}
            </div>
            <div className="p-3">
              <ProductPriceChart
                data={priceHistory}
                refPrice={book?.refPrice}
                height={150}
              />
            </div>
          </div>

          {/* Order book: asks left, bids right */}
          <div className="grid lg:grid-cols-2 gap-4">
            {/* ASKs (sell orders) */}
            <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                <p className="text-sm font-semibold text-red-400 flex items-center gap-1.5">
                  <ArrowDownUp size={13} /> ASK (продають)
                  <span className="text-gray-600 font-normal text-xs ml-1">{book?.asks.length ?? 0} ордерів</span>
                </p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800/60">
                    <th className="px-3 py-2 text-left text-[10px] text-gray-600 uppercase">Ціна ₴</th>
                    <th className="px-3 py-2 text-right text-[10px] text-gray-600 uppercase">К-ть</th>
                    <th className="px-3 py-2 text-right text-[10px] text-gray-600 uppercase">Якість</th>
                    <th className="px-3 py-2 text-right text-[10px] text-gray-600 uppercase">Продавець</th>
                  </tr>
                </thead>
                <tbody>
                  {(book?.asks ?? []).length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-600 text-xs">Немає sell-ордерів</td></tr>
                  ) : book!.asks.map((a, i) => (
                    <tr key={a.id} className={cn("relative", a.isMe ? "bg-amber-950/20" : i % 2 === 0 ? "bg-transparent" : "bg-gray-800/20")}>
                      <td className="px-3 py-2 relative">
                        <div className="absolute inset-0 bg-red-500/10 origin-left" style={{ width: `${(a.qty / maxAskQty) * 100}%` }} />
                        <span className="relative font-mono font-semibold text-red-400">₴{a.price.toFixed(2)}</span>
                        {a.isMe && <span className="relative ml-1 text-[9px] text-amber-400 font-bold">ВИ</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-gray-300">{formatNumber(a.qty)}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-400">{a.quality.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right text-gray-500 text-xs truncate max-w-[80px]">{a.seller}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* BIDs (buy orders) */}
            <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                <p className="text-sm font-semibold text-emerald-400 flex items-center gap-1.5">
                  <ArrowDownUp size={13} /> BID (купують)
                  <span className="text-gray-600 font-normal text-xs ml-1">{book?.bids.length ?? 0} ордерів</span>
                </p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800/60">
                    <th className="px-3 py-2 text-left text-[10px] text-gray-600 uppercase">Ціна ₴</th>
                    <th className="px-3 py-2 text-right text-[10px] text-gray-600 uppercase">К-ть</th>
                    <th className="px-3 py-2 text-right text-[10px] text-gray-600 uppercase">Мін.як.</th>
                    <th className="px-3 py-2 text-right text-[10px] text-gray-600 uppercase">Покупець</th>
                  </tr>
                </thead>
                <tbody>
                  {(book?.bids ?? []).length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-600 text-xs">Немає buy-ордерів</td></tr>
                  ) : book!.bids.map((b, i) => (
                    <tr key={b.id} className={cn("relative", b.isMe ? "bg-amber-950/20" : i % 2 === 0 ? "bg-transparent" : "bg-gray-800/20")}>
                      <td className="px-3 py-2 relative">
                        <div className="absolute inset-0 bg-emerald-500/10 origin-left" style={{ width: `${(b.qty / maxBidQty) * 100}%` }} />
                        <span className="relative font-mono font-semibold text-emerald-400">₴{b.price.toFixed(2)}</span>
                        {b.isMe && <span className="relative ml-1 text-[9px] text-amber-400 font-bold">ВИ</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-gray-300">{formatNumber(b.qty)}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-400">{b.qualityMin.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right text-gray-500 text-xs truncate max-w-[80px]">{b.buyer}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent trades */}
          {book && book.trades.length > 0 && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800">
                <p className="text-sm font-semibold text-gray-300 flex items-center gap-1.5">
                  <Clock size={13} className="text-gray-500" /> Останні угоди
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-800/60">
                      <th className="px-3 py-2 text-left text-[10px] text-gray-600 uppercase">Ціна</th>
                      <th className="px-3 py-2 text-right text-[10px] text-gray-600 uppercase">К-ть</th>
                      <th className="px-3 py-2 text-right text-[10px] text-gray-600 uppercase">Якість</th>
                      <th className="px-3 py-2 text-right text-[10px] text-gray-600 uppercase">Час</th>
                    </tr>
                  </thead>
                  <tbody>
                    {book.trades.map((t, i) => {
                      const prev = book.trades[i + 1];
                      const up   = prev ? t.price >= prev.price : true;
                      return (
                        <tr key={i} className="border-b border-gray-800/30 last:border-0">
                          <td className="px-3 py-1.5">
                            <span className={cn("font-mono font-semibold", up ? "text-emerald-400" : "text-red-400")}>
                              ₴{t.price.toFixed(2)}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-gray-300">{formatNumber(t.qty)}</td>
                          <td className="px-3 py-1.5 text-right text-gray-500">{t.quality.toFixed(1)}</td>
                          <td className="px-3 py-1.5 text-right text-gray-600">{timeAgo(t.executedAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* BUY order modal */}
      <Dialog
        open={buyModalOpen}
        onClose={() => setBuyModalOpen(false)}
        title={`BUY-ордер: ${selectedProduct?.nameUa ?? ""}`}
        size="md"
      >
        <form onSubmit={placeBuyOrder} className="space-y-4">
          <div className="rounded-xl bg-gray-900 border border-gray-800 px-4 py-3 text-sm text-gray-400 space-y-1">
            <p>BUY-ордер — заявка на купівлю. TickEngine автоматично виконає її при збігу ціни з продавцем.</p>
            {book?.asks[0] && (
              <p className="text-gray-500 text-xs">Найкраща пропозиція продавця: <span className="text-white font-mono">₴{book.asks[0].price.toFixed(2)}</span></p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label={`Кількість (${selectedProduct?.unit ?? ""})*`}
              type="number" min={1} step={1}
              placeholder="100"
              value={buyForm.quantity}
              onChange={(e) => setBuyForm((p) => ({ ...p, quantity: e.target.value }))}
              required
            />
            <Input
              label="Макс. ціна / од. (₴) *"
              type="number" min={0.01} step={0.01}
              placeholder={book?.asks[0] ? book.asks[0].price.toFixed(2) : "0"}
              value={buyForm.price}
              onChange={(e) => setBuyForm((p) => ({ ...p, price: e.target.value }))}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Мін. якість (0–10)"
              type="number" min={0} max={10} step={0.1}
              value={buyForm.qualityMin}
              onChange={(e) => setBuyForm((p) => ({ ...p, qualityMin: e.target.value }))}
            />
            <Select
              label="Термін дії"
              value={buyForm.daysValid}
              onChange={(e) => setBuyForm((p) => ({ ...p, daysValid: e.target.value }))}
              options={[
                { value: "1", label: "1 день" }, { value: "3", label: "3 дні" },
                { value: "7", label: "7 днів" }, { value: "14", label: "14 днів" },
                { value: "30", label: "30 днів" },
              ]}
            />
          </div>

          {buyForm.quantity && buyForm.price && (
            <div className="rounded-xl bg-emerald-950/40 border border-emerald-800/40 px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-gray-400">Максимальна вартість:</span>
              <span className="text-lg font-bold font-mono text-emerald-400">
                ₴{formatNumber(Number(buyForm.quantity) * Number(buyForm.price))}
              </span>
            </div>
          )}

          {submitMsg && (
            <div className={cn(
              "flex items-center gap-2 text-sm px-4 py-3 rounded-xl border",
              submitMsg.ok
                ? "text-emerald-400 bg-emerald-950/40 border-emerald-800/40"
                : "text-red-400 bg-red-950/40 border-red-800/40",
            )}>
              {submitMsg.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
              {submitMsg.text}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setBuyModalOpen(false)}>
              Скасувати
            </Button>
            <Button type="submit" loading={submitting} className="flex-1">
              <TrendingUp size={14} /> Виставити BID
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

// ─── Offers tab ───────────────────────────────────────────────────────────────

function OffersTab() {
  const [offers,      setOffers]      = useState<Offer[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [modalOpen,   setModalOpen]   = useState(false);
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  const [inventory,   setInventory]   = useState<InvItem[]>([]);
  const [form, setForm] = useState({
    enterpriseId: "", productId: "", quantity: "", price: "", minOrder: "1", daysValid: "7",
  });
  const [submitting,  setSubmitting]  = useState(false);
  const [formError,   setFormError]   = useState("");
  const [buyOffer,    setBuyOffer]    = useState<Offer | null>(null);
  const [buyEntId,    setBuyEntId]    = useState("");
  const [buyQty,      setBuyQty]      = useState(1);
  const [buying,      setBuying]      = useState(false);
  const [buyError,    setBuyError]    = useState("");
  const [buySuccess,  setBuySuccess]  = useState("");

  const loadOffers = useCallback(() => {
    setLoading(true);
    fetch("/api/market").then((r) => r.json()).then((d) => setOffers(d.offers ?? [])).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadOffers(); }, [loadOffers]);

  useEffect(() => {
    if (!buyOffer && !modalOpen) return;
    if (enterprises.length > 0) return;
    fetch("/api/enterprises").then((r) => r.json()).then((d) => {
      setEnterprises((d.enterprises ?? []).map((e: { id: string; name: string; cityName: string }) => ({ id: e.id, name: e.name, cityName: e.cityName })));
    });
  }, [buyOffer, modalOpen, enterprises.length]);

  useEffect(() => {
    if (!form.enterpriseId) { setInventory([]); return; }
    fetch(`/api/enterprises/${form.enterpriseId}/inventory`).then((r) => r.json()).then((d) => setInventory(d.inventory ?? [])).catch(() => setInventory([]));
  }, [form.enterpriseId]);

  const selectedInv = inventory.find((i) => i.productId === form.productId);

  async function handleSell(e: React.FormEvent) {
    e.preventDefault(); setFormError("");
    const qty = Number(form.quantity); const price = Number(form.price);
    if (!form.enterpriseId || !form.productId || !qty || !price) { setFormError("Заповніть всі обов'язкові поля"); return; }
    if (selectedInv && qty > selectedInv.quantity) { setFormError(`Максимум: ${selectedInv.quantity} ${selectedInv.unit}`); return; }
    setSubmitting(true);
    const res = await fetch("/api/market", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enterpriseId: form.enterpriseId, productId: form.productId, quantity: qty, price, minOrder: Number(form.minOrder), daysValid: Number(form.daysValid) }) });
    const data = await res.json(); setSubmitting(false);
    if (!res.ok) { setFormError(data.error ?? "Помилка"); return; }
    setModalOpen(false); setForm({ enterpriseId: "", productId: "", quantity: "", price: "", minOrder: "1", daysValid: "7" }); loadOffers();
  }

  function openBuy(offer: Offer) { setBuyOffer(offer); setBuyQty(offer.minOrder); setBuyEntId(""); setBuyError(""); setBuySuccess(""); }

  async function handleBuy() {
    if (!buyOffer || !buyEntId || buyQty < 1) { setBuyError("Оберіть підприємство та вкажіть кількість"); return; }
    setBuying(true); setBuyError(""); setBuySuccess("");
    const res = await fetch("/api/market/buy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offerId: buyOffer.id, quantity: buyQty, buyerEnterpriseId: buyEntId }) });
    const data = await res.json(); setBuying(false);
    if (!res.ok) { setBuyError(data.error ?? "Помилка"); return; }
    setBuySuccess(`✓ Куплено ${buyQty} ${buyOffer.unit} · −${formatNumber(buyQty * buyOffer.price)} ₴`);
    loadOffers(); setTimeout(() => setBuyOffer(null), 2000);
  }

  const filtered = offers.filter((o) =>
    o.productName.toLowerCase().includes(search.toLowerCase()) ||
    o.sellerName.toLowerCase().includes(search.toLowerCase()) ||
    o.cityName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-gray-500 text-sm">{offers.length} активних пропозицій</p>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <input
              className="bg-gray-900 border border-gray-800 rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-600 w-48"
              placeholder="Пошук..."
              value={search} onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button onClick={loadOffers} disabled={loading} className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors disabled:opacity-40">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
          <Button size="sm" onClick={() => { setFormError(""); setModalOpen(true); }}>
            <ShoppingCart size={14} /> Виставити
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Активні пропозиції (SELL)</CardTitle></CardHeader>
        <CardContent className="pt-0 px-0">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Товар</TableHeader>
                <TableHeader>Місто</TableHeader>
                <TableHeader>Продавець</TableHeader>
                <TableHeader className="text-right">Ціна</TableHeader>
                <TableHeader className="text-right">vs Базова</TableHeader>
                <TableHeader className="text-right">К-ть</TableHeader>
                <TableHeader>Дія</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7}><SkeletonTable rows={5} cols={6} /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableEmpty>{offers.length === 0 ? "На ринку поки немає пропозицій." : "Нічого не знайдено"}</TableEmpty>
              ) : filtered.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <div className="font-medium text-white">{o.productName}</div>
                    <div className="text-xs text-gray-600">{o.unit}</div>
                  </TableCell>
                  <TableCell className="text-gray-400">{o.cityName}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-300">{o.sellerName}</span>
                      {o.isNpc && <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">⭐ NPC</span>}
                    </div>
                    <div className="text-xs text-gray-600">{o.isNpc ? "Гарант. якість 3–4.6" : `Рейтинг ${o.sellerRating.toFixed(0)}`}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    <CurrencyDisplay amount={o.price} currency="UAH" size="sm" />
                    <div className="text-xs text-gray-600">/ {o.unit}</div>
                  </TableCell>
                  <TableCell className="text-right"><PriceVsBase ratio={o.priceVsBase} /></TableCell>
                  <TableCell className="text-right font-mono text-white">{formatNumber(o.quantity)} {o.unit}</TableCell>
                  <TableCell><Button size="sm" variant="outline" onClick={() => openBuy(o)}>Купити</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Buy modal */}
      <Dialog open={!!buyOffer} onClose={() => setBuyOffer(null)} title={`Купити: ${buyOffer?.productName ?? ""}`} size="md">
        {buyOffer && (
          <div className="space-y-4">
            <div className="rounded-xl bg-gray-900 border border-gray-800 px-4 py-3 space-y-1.5">
              {[["Продавець", buyOffer.sellerName], ["Місто", buyOffer.cityName], [`Ціна / ${buyOffer.unit}`, `${formatNumber(buyOffer.price)} ₴`], ["Доступно", `${formatNumber(buyOffer.quantity)} ${buyOffer.unit}`]].map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm"><span className="text-gray-500">{k}</span><span className="text-white font-medium">{v}</span></div>
              ))}
            </div>
            <Select label="Доставити на підприємство *" placeholder="Оберіть підприємство..." value={buyEntId} onChange={(e) => setBuyEntId(e.target.value)} options={enterprises.map((en) => ({ value: en.id, label: `${en.name} (${en.cityName})` }))} />
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Кількість ({buyOffer.unit})</label>
              <div className="flex items-center gap-3">
                <input type="range" min={buyOffer.minOrder} max={buyOffer.quantity} step={buyOffer.minOrder} value={buyQty} onChange={(e) => setBuyQty(+e.target.value)} className="flex-1 accent-emerald-500" />
                <input type="number" min={buyOffer.minOrder} max={buyOffer.quantity} value={buyQty} onChange={(e) => setBuyQty(Math.max(buyOffer.minOrder, Math.min(buyOffer.quantity, +e.target.value)))} className="w-24 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 font-mono text-center [appearance:textfield]" />
              </div>
            </div>
            <div className="rounded-xl bg-emerald-950/40 border border-emerald-800/40 px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-gray-400">До сплати:</span>
              <span className="text-lg font-bold font-mono text-emerald-400">{formatNumber(buyQty * buyOffer.price)} ₴</span>
            </div>
            {buyError   && <div className="flex items-center gap-2 text-red-400 text-sm bg-red-950/40 border border-red-800/40 rounded-xl px-4 py-3"><AlertCircle size={15} />{buyError}</div>}
            {buySuccess && <div className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-950/40 border border-emerald-800/40 rounded-xl px-4 py-3"><CheckCircle2 size={15} />{buySuccess}</div>}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setBuyOffer(null)}>Скасувати</Button>
              <Button className="flex-1" onClick={handleBuy} disabled={buying || !buyEntId || buyQty < buyOffer.minOrder}>
                {buying ? <Loader2 size={15} className="animate-spin" /> : <ShoppingCart size={15} />} Купити
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Sell modal */}
      <Dialog open={modalOpen} onClose={() => setModalOpen(false)} title="Виставити товар на ринок" size="lg">
        <form onSubmit={handleSell} className="space-y-4">
          <Select label="Підприємство *" placeholder="Оберіть підприємство..." value={form.enterpriseId} onChange={(e) => setForm((p) => ({ ...p, enterpriseId: e.target.value, productId: "" }))} options={enterprises.map((en) => ({ value: en.id, label: `${en.name} (${en.cityName})` }))} required />
          {form.enterpriseId && (
            <Select label="Товар *" placeholder={inventory.length === 0 ? "Склад порожній" : "Оберіть товар..."} value={form.productId} onChange={(e) => setForm((p) => ({ ...p, productId: e.target.value }))} options={inventory.map((i) => ({ value: i.productId, label: `${i.product} — ${formatNumber(i.quantity)} ${i.unit}` }))} disabled={inventory.length === 0} required />
          )}
          {selectedInv && <div className="text-xs text-gray-500 bg-gray-800 rounded-lg px-3 py-2">Доступно: <span className="text-white font-medium">{formatNumber(selectedInv.quantity)} {selectedInv.unit}</span></div>}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Кількість *" type="number" placeholder="0" min={1} max={selectedInv?.quantity} value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))} required />
            <Input label="Ціна / од. (₴) *" type="number" placeholder="0" min={0.01} step={0.01} value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Мін. замовлення" type="number" placeholder="1" min={1} value={form.minOrder} onChange={(e) => setForm((p) => ({ ...p, minOrder: e.target.value }))} />
            <Select label="Термін дії" value={form.daysValid} onChange={(e) => setForm((p) => ({ ...p, daysValid: e.target.value }))} options={[{ value: "1", label: "1 день" }, { value: "3", label: "3 дні" }, { value: "7", label: "7 днів" }, { value: "14", label: "14 днів" }, { value: "30", label: "30 днів" }]} />
          </div>
          {formError && <div className="bg-red-950 border border-red-900 text-red-400 text-sm px-4 py-3 rounded-lg">{formError}</div>}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setModalOpen(false)}>Скасувати</Button>
            <Button type="submit" loading={submitting} className="flex-1"><ShoppingCart size={14} /> Виставити</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type MarketTab = "offers" | "orderbook";

export default function MarketPage() {
  const [tab, setTab] = useState<MarketTab>("offers");

  const TABS: { key: MarketTab; label: string; icon: React.ElementType }[] = [
    { key: "offers",    label: "Пропозиції",  icon: ShoppingCart },
    { key: "orderbook", label: "Order Book",  icon: BookOpen     },
  ];

  return (
    <div className="space-y-5 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-white">B2B Ринок</h1>
        <p className="text-gray-500 text-sm mt-1">Торгівля між гравцями та ліміт-ордери</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px",
              tab === key
                ? "text-white border-emerald-500"
                : "text-gray-500 border-transparent hover:text-gray-300 hover:border-gray-600",
            )}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === "offers"    && <OffersTab />}
      {tab === "orderbook" && <OrderBookPanel />}
    </div>
  );
}
