"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ShoppingCart, TrendingUp, TrendingDown, Minus, Search,
  CheckCircle2, AlertCircle, Loader2, BookOpen, ArrowDownUp,
  RefreshCw, Clock, ChevronDown, ListOrdered, X,
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
  resourceType: string;
};

const CAT_META: Record<string, { label: string; emoji: string }> = {
  all: { label: "Всі",        emoji: "🛒" },
  RM:  { label: "Сировина",   emoji: "🌾" },
  SF:  { label: "Напівфаб.",  emoji: "🔩" },
  FG:  { label: "Готова",     emoji: "🍞" },
  CM:  { label: "Будмат.",    emoji: "🧱" },
  EQ:  { label: "Обладнання", emoji: "⚙️" },
};

const SORT_OPTS = [
  { value: "default",         label: "За замовч." },
  { value: "price_asc",       label: "Ціна ↑" },
  { value: "price_desc",      label: "Ціна ↓" },
  { value: "quality_desc",    label: "Якість ↓" },
  { value: "quality_asc",     label: "Якість ↑" },
  { value: "qty_desc",        label: "К-ть ↓" },
  { value: "priceVsBase_asc", label: "Вигідні" },
];

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
  const [activeCategory, setActiveCategory] = useState("all");
  const [sortBy,      setSortBy]      = useState("default");
  const [sellerType,  setSellerType]  = useState<"all"|"npc"|"player">("all");
  const [minQuality,  setMinQuality]  = useState("");
  const [maxQuality,  setMaxQuality]  = useState("");
  const [minPrice,    setMinPrice]    = useState("");
  const [maxPrice,    setMaxPrice]    = useState("");
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
    window.dispatchEvent(new CustomEvent("game:balance"));
    loadOffers(); setTimeout(() => setBuyOffer(null), 2000);
  }

  // Які категорії присутні в поточних офферах
  const presentCats = ["all", ...Array.from(new Set(
    offers.map(o => o.resourceType?.split("-")[0] ?? "").filter(Boolean)
  )).sort()];

  const filtered = offers
    .filter((o) => {
      const cat = o.resourceType?.split("-")[0] ?? "";
      if (activeCategory !== "all" && cat !== activeCategory) return false;
      if (sellerType === "npc"    && !o.isNpc)  return false;
      if (sellerType === "player" && o.isNpc)   return false;
      if (minQuality && o.quality < Number(minQuality)) return false;
      if (maxQuality && o.quality > Number(maxQuality)) return false;
      if (minPrice   && o.price   < Number(minPrice))   return false;
      if (maxPrice   && o.price   > Number(maxPrice))   return false;
      const q = search.toLowerCase();
      if (q && !o.productName.toLowerCase().includes(q) && !o.sellerName.toLowerCase().includes(q)) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "price_asc")       return a.price - b.price;
      if (sortBy === "price_desc")      return b.price - a.price;
      if (sortBy === "quality_desc")    return b.quality - a.quality;
      if (sortBy === "quality_asc")     return a.quality - b.quality;
      if (sortBy === "qty_desc")        return b.quantity - a.quantity;
      if (sortBy === "priceVsBase_asc") return a.priceVsBase - b.priceVsBase;
      return 0;
    });

  return (
    <>
      {/* ── Категорійні таби ── */}
      <div className="flex flex-wrap gap-1.5">
        {presentCats.map((cat) => {
          const meta = CAT_META[cat] ?? { label: cat, emoji: "📦" };
          const count = cat === "all" ? offers.length : offers.filter(o => (o.resourceType?.split("-")[0] ?? "") === cat).length;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                activeCategory === cat
                  ? "bg-emerald-600 text-white"
                  : "bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800 border border-gray-800",
              )}
            >
              <span>{meta.emoji}</span>
              <span>{meta.label}</span>
              <span className={cn("text-xs rounded px-1", activeCategory === cat ? "bg-emerald-700 text-emerald-100" : "bg-gray-800 text-gray-500")}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* ── Пошук + фільтри + сортування ── */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-3 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          {/* Пошук */}
          <div className="relative flex-1 min-w-40">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <input
              className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
              placeholder="Назва товару або продавець..."
              value={search} onChange={(e) => setSearch(e.target.value)}
            />
            {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"><X size={13} /></button>}
          </div>

          {/* Сортування */}
          <div className="relative">
            <ArrowDownUp size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <select
              value={sortBy} onChange={e => setSortBy(e.target.value)}
              className="bg-gray-900 border border-gray-800 rounded-lg pl-7 pr-7 py-1.5 text-sm text-white appearance-none focus:outline-none focus:ring-1 focus:ring-emerald-600"
            >
              {SORT_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          </div>

          {/* Тип продавця */}
          <div className="flex rounded-lg overflow-hidden border border-gray-800">
            {(["all","player","npc"] as const).map((v) => (
              <button key={v} onClick={() => setSellerType(v)}
                className={cn("px-2.5 py-1.5 text-xs font-medium transition-colors",
                  sellerType === v ? "bg-emerald-600 text-white" : "bg-gray-900 text-gray-500 hover:text-white"
                )}>
                {v === "all" ? "Всі" : v === "player" ? "👤 Гравці" : "🏛️ ДержПром"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <button onClick={loadOffers} disabled={loading} className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors disabled:opacity-40">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
            <Button size="sm" onClick={() => { setFormError(""); setModalOpen(true); }}>
              <ShoppingCart size={13} /> Виставити
            </Button>
          </div>
        </div>

        {/* Ціна і якість */}
        <div className="flex flex-wrap gap-2 items-center text-xs text-gray-500">
          <span>Ціна ₴:</span>
          <input type="number" placeholder="від" value={minPrice} onChange={e => setMinPrice(e.target.value)}
            className="w-20 bg-gray-900 border border-gray-800 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-emerald-600" />
          <span>—</span>
          <input type="number" placeholder="до" value={maxPrice} onChange={e => setMaxPrice(e.target.value)}
            className="w-24 bg-gray-900 border border-gray-800 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-emerald-600" />
          <span className="ml-3">Якість:</span>
          <input type="number" placeholder="від" min={0} max={10} step={0.1} value={minQuality} onChange={e => setMinQuality(e.target.value)}
            className="w-16 bg-gray-900 border border-gray-800 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-emerald-600" />
          <span>—</span>
          <input type="number" placeholder="до" min={0} max={10} step={0.1} value={maxQuality} onChange={e => setMaxQuality(e.target.value)}
            className="w-16 bg-gray-900 border border-gray-800 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-emerald-600" />
          {(minPrice || maxPrice || minQuality || maxQuality) && (
            <button onClick={() => { setMinPrice(""); setMaxPrice(""); setMinQuality(""); setMaxQuality(""); }}
              className="ml-1 text-red-400 hover:text-red-300 flex items-center gap-0.5">
              <X size={11} /> Скинути
            </button>
          )}
          <span className="ml-auto text-gray-600">{filtered.length} пропозицій</span>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Пропозиції SELL</CardTitle></CardHeader>
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
                    <div className="font-medium text-white flex items-center gap-1.5">
                      {CAT_META[o.resourceType?.split("-")[0] ?? ""]?.emoji ?? "📦"}
                      {o.productName}
                    </div>
                    <div className="text-xs text-gray-600">{o.unit}</div>
                  </TableCell>
                  <TableCell className="text-gray-400">{o.cityName}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-300">{o.sellerName}</span>
                      {o.isNpc && <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">🏛️ ДержПром</span>}
                    </div>
                    <div className="text-xs text-gray-600">{o.isNpc ? "Держ. постачальник" : `Рейтинг ${o.sellerRating.toFixed(0)}`}</div>
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

// ─── My Orders Tab ────────────────────────────────────────────────────────────

type MyOrder = {
  id: string; type: "BUY" | "SELL"; status: string;
  productName: string; unit: string;
  price: number; qualityMin: number;
  quantityTotal: number; quantityFilled: number;
  expiresAt: string; createdAt: string;
};

function MyOrdersTab() {
  const [orders,    setOrders]    = useState<MyOrder[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/market/order")
      .then(r => r.json())
      .then(d => setOrders(d.orders ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function cancel(id: string) {
    setCancelling(id);
    await fetch(`/api/market/order?id=${id}`, { method: "DELETE" });
    setOrders(prev => prev.filter(o => o.id !== id));
    setCancelling(null);
  }

  if (loading) return <SkeletonTable rows={4} />;

  if (orders.length === 0) return (
    <div className="rounded-xl border border-dashed border-gray-800 py-16 text-center">
      <ListOrdered size={28} className="text-gray-700 mx-auto mb-3" />
      <p className="text-gray-500 text-sm">Активних ордерів немає</p>
      <p className="text-gray-600 text-xs mt-1">Виставте BUY-ордер в Order Book або SELL-пропозицію</p>
    </div>
  );

  return (
    <div className="space-y-2">
      {orders.map(o => {
        const filled = o.quantityTotal > 0 ? o.quantityFilled / o.quantityTotal : 0;
        const remaining = o.quantityTotal - o.quantityFilled;
        const expires = new Date(o.expiresAt);
        const daysLeft = Math.ceil((expires.getTime() - Date.now()) / 86400000);
        return (
          <div key={o.id} className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 flex items-center gap-3">
            <div className={cn("px-2 py-0.5 rounded text-[10px] font-bold tracking-wider shrink-0", o.type === "BUY" ? "bg-emerald-950 text-emerald-400" : "bg-blue-950 text-blue-400")}>
              {o.type}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-sm font-medium text-white">{o.productName}</span>
                <span className="text-xs text-gray-500">{formatNumber(o.price)} ₴/{o.unit}</span>
              </div>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex-1 bg-gray-800 rounded-full h-1 max-w-24">
                  <div className="bg-emerald-500 h-1 rounded-full" style={{ width: `${Math.round(filled * 100)}%` }} />
                </div>
                <span className="text-[10px] text-gray-500">{formatNumber(o.quantityFilled)}/{formatNumber(o.quantityTotal)} {o.unit}</span>
                <span className={cn("text-[10px]", daysLeft <= 1 ? "text-red-400" : "text-gray-600")}>
                  <Clock size={9} className="inline mr-0.5" />{daysLeft}д
                </span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-gray-400 font-mono">{formatNumber(remaining)} {o.unit}</p>
              <p className="text-[10px] text-gray-600">залишилось</p>
            </div>
            <button
              onClick={() => cancel(o.id)}
              disabled={cancelling === o.id}
              className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-950/30 transition-colors"
              title="Скасувати"
            >
              {cancelling === o.id ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
            </button>
          </div>
        );
      })}
      <p className="text-[10px] text-gray-600 text-center pt-1">Ордери виконуються автоматично на кожному тіку</p>
    </div>
  );
}

// ─── State Orders Tab ─────────────────────────────────────────────────────────

type StateOrder = {
  id: string; productId: string; productName: string; unit: string;
  resourceType: string; price: number; refPrice: number; premium: string;
  qualityMin: number; quantityTotal: number; quantityLeft: number; expiresAt: string;
};

function StateOrdersTab() {
  const [orders,      setOrders]      = useState<StateOrder[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  const [fillOrder,   setFillOrder]   = useState<StateOrder | null>(null);
  const [fillEnt,     setFillEnt]     = useState("");
  const [fillQty,     setFillQty]     = useState("");
  const [fillErr,     setFillErr]     = useState("");
  const [filling,     setFilling]     = useState(false);
  const [fillOk,      setFillOk]      = useState("");

  useEffect(() => {
    setLoading(true);
    fetch("/api/market/state-orders").then(r => r.json()).then(d => setOrders(d.orders ?? [])).finally(() => setLoading(false));
    fetch("/api/enterprises").then(r => r.json()).then(d => setEnterprises((d.enterprises ?? []).map((e: { id: string; name: string; cityName: string }) => ({ id: e.id, name: e.name, cityName: e.cityName }))));
  }, []);

  async function handleFill(e: React.FormEvent) {
    e.preventDefault();
    if (!fillOrder || !fillEnt || !fillQty) { setFillErr("Заповніть всі поля"); return; }
    setFilling(true); setFillErr(""); setFillOk("");
    const res = await fetch("/api/market", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enterpriseId: fillEnt,
        productId:    fillOrder.productId,
        quantity:     Number(fillQty),
        price:        fillOrder.price,
        minOrder:     1,
        daysValid:    3,
      }),
    });
    const data = await res.json();
    setFilling(false);
    if (!res.ok) { setFillErr(data.error ?? "Помилка"); return; }
    setFillOk(`✓ SELL ордер виставлено за ₴${fillOrder.price}/${fillOrder.unit} — матчиться автоматично`);
    window.dispatchEvent(new CustomEvent("game:balance"));
    setTimeout(() => { setFillOrder(null); setFillOk(""); }, 3000);
  }

  if (loading) return <SkeletonTable rows={4} />;

  if (orders.length === 0) return (
    <div className="rounded-xl border border-dashed border-amber-800/40 py-16 text-center">
      <span className="text-4xl block mb-3">🏛️</span>
      <p className="text-gray-400 font-medium">Активних держзамовлень немає</p>
      <p className="text-gray-600 text-sm mt-1">Нові замовлення з'являються кожні 24 тіки</p>
    </div>
  );

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {orders.map(o => (
          <div key={o.id} className="rounded-xl border border-amber-700/30 bg-amber-950/10 p-5 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{CAT_META[o.resourceType?.split("-")[0] ?? ""]?.emoji ?? "📦"}</span>
                <div>
                  <p className="font-semibold text-white">{o.productName}</p>
                  <p className="text-xs text-gray-500">{o.resourceType}</p>
                </div>
              </div>
              <span className="text-xs font-bold px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                +{o.premium}% від ринку
              </span>
            </div>

            <div className="rounded-lg bg-gray-900 border border-gray-800 divide-y divide-gray-800 text-sm">
              <div className="flex justify-between px-3 py-2"><span className="text-gray-500">Ціна закупівлі</span><span className="font-mono text-emerald-400 font-bold">₴{o.price}/{o.unit}</span></div>
              <div className="flex justify-between px-3 py-2"><span className="text-gray-500">Ринкова ціна</span><span className="font-mono text-gray-400">₴{o.refPrice.toFixed(1)}/{o.unit}</span></div>
              <div className="flex justify-between px-3 py-2"><span className="text-gray-500">Потрібно</span><span className="font-mono text-white">{formatNumber(o.quantityLeft)} {o.unit}</span></div>
              <div className="flex justify-between px-3 py-2"><span className="text-gray-500">Мін. якість</span><span className="font-mono text-white">{o.qualityMin.toFixed(1)}</span></div>
            </div>

            {/* Прогрес */}
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Виконано</span>
                <span>{formatNumber(o.quantityTotal - o.quantityLeft)} / {formatNumber(o.quantityTotal)}</span>
              </div>
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${((o.quantityTotal - o.quantityLeft) / o.quantityTotal) * 100}%` }} />
              </div>
            </div>

            <Button
              className="w-full bg-amber-600 hover:bg-amber-500 text-white"
              onClick={() => { setFillOrder(o); setFillEnt(""); setFillQty(String(Math.min(100, o.quantityLeft))); setFillErr(""); setFillOk(""); }}
            >
              <ShoppingCart size={14} /> Виконати замовлення
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={!!fillOrder} onClose={() => setFillOrder(null)} title="Виконати держзамовлення" size="md">
        {fillOrder && (
          <form onSubmit={handleFill} className="space-y-4">
            <div className="rounded-xl bg-amber-950/30 border border-amber-700/30 p-4 space-y-1.5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{CAT_META[fillOrder.resourceType?.split("-")[0] ?? ""]?.emoji ?? "📦"}</span>
                <div>
                  <p className="font-semibold text-white">{fillOrder.productName}</p>
                  <p className="text-xs text-amber-400">🏛️ Держзамовлення · +{fillOrder.premium}% премія</p>
                </div>
              </div>
              {[
                ["Ціна закупівлі", `₴${fillOrder.price}/${fillOrder.unit}`],
                ["Залишилось купити", `${formatNumber(fillOrder.quantityLeft)} ${fillOrder.unit}`],
                ["Мін. якість", fillOrder.qualityMin.toFixed(1)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm"><span className="text-gray-500">{k}</span><span className="text-white">{v}</span></div>
              ))}
            </div>

            <p className="text-xs text-gray-500 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
              💡 Ваш SELL ордер виставляється за ₴{fillOrder.price}/{fillOrder.unit} і автоматично матчиться з держзамовленням на наступному тіку. Репутація +0.3 після виконання.
            </p>

            <Select label="Підприємство *" placeholder="Оберіть..." value={fillEnt} onChange={e => setFillEnt(e.target.value)} options={enterprises.map(en => ({ value: en.id, label: `${en.name} (${en.cityName})` }))} required />
            <Input label={`Кількість (${fillOrder.unit}) *`} type="number" min={1} max={fillOrder.quantityLeft} value={fillQty} onChange={e => setFillQty(e.target.value)} required />

            {fillErr && <p className="text-sm text-red-400 bg-red-950/30 border border-red-800/30 rounded-lg px-3 py-2">{fillErr}</p>}
            {fillOk  && <p className="text-sm text-emerald-400 bg-emerald-950/30 border border-emerald-800/30 rounded-lg px-3 py-2">{fillOk}</p>}

            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setFillOrder(null)}>Скасувати</Button>
              <Button type="submit" loading={filling} className="flex-1 bg-amber-600 hover:bg-amber-500">
                <ShoppingCart size={14} /> Виконати
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type MarketTab = "offers" | "orderbook" | "myorders" | "stateorders";

export default function MarketPage() {
  const [tab, setTab] = useState<MarketTab>("offers");

  const TABS: { key: MarketTab; label: string; icon?: React.ElementType; emoji?: string }[] = [
    { key: "offers",      label: "Пропозиції",       icon: ShoppingCart },
    { key: "stateorders", label: "Держзамовлення",   emoji: "🏛️"        },
    { key: "orderbook",   label: "Order Book",        icon: BookOpen     },
    { key: "myorders",    label: "Мої ордери",        icon: ListOrdered  },
  ];

  return (
    <div className="space-y-5 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-white">B2B Ринок</h1>
        <p className="text-gray-500 text-sm mt-1">Торгівля між гравцями та ліміт-ордери</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800">
        {TABS.map(({ key, label, icon: Icon, emoji }) => (
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
            {Icon ? <Icon size={14} /> : <span>{emoji}</span>} {label}
          </button>
        ))}
      </div>

      {tab === "offers"      && <OffersTab />}
      {tab === "stateorders" && <StateOrdersTab />}
      {tab === "orderbook"   && <OrderBookPanel />}
      {tab === "myorders"    && <MyOrdersTab />}
    </div>
  );
}
