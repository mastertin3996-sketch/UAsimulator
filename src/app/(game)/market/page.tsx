"use client";

import { useEffect, useState, useCallback } from "react";
import { ShoppingCart, TrendingUp, TrendingDown, Minus, Search, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
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
import { SkeletonTable } from "@/components/ui/skeleton";
import { cn, formatNumber } from "@/lib/utils";

type Offer = {
  id: string; productName: string; unit: string; basePrice: number;
  cityName: string; sellerName: string; sellerRating: number;
  price: number; quantity: number; minOrder: number; quality: number;
  expiresAt: string | null; priceVsBase: number; isNpc?: boolean;
};

type Enterprise = { id: string; name: string; cityName: string };
type InvItem = { productId: string; product: string; unit: string; quantity: number };

function PriceVsBase({ ratio }: { ratio: number }) {
  const pct = ((ratio - 1) * 100).toFixed(1);
  if (ratio <= 0.9) return <span className="flex items-center gap-1 text-green-400 text-xs"><TrendingDown size={12} />−{Math.abs(Number(pct))}%</span>;
  if (ratio >= 1.1) return <span className="flex items-center gap-1 text-red-400 text-xs"><TrendingUp size={12} />+{pct}%</span>;
  return <span className="flex items-center gap-1 text-gray-500 text-xs"><Minus size={12} />{pct}%</span>;
}

export default function MarketPage() {
  const [offers, setOffers]     = useState<Offer[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  // Modal state
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  const [inventory, setInventory]     = useState<InvItem[]>([]);
  const [form, setForm] = useState({
    enterpriseId: "", productId: "", quantity: "", price: "", minOrder: "1", daysValid: "7",
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError]   = useState("");

  // Buy modal state
  const [buyOffer,      setBuyOffer]      = useState<Offer | null>(null);
  const [buyEntId,      setBuyEntId]      = useState("");
  const [buyQty,        setBuyQty]        = useState(1);
  const [buying,        setBuying]        = useState(false);
  const [buyError,      setBuyError]      = useState("");
  const [buySuccess,    setBuySuccess]    = useState("");

  const loadOffers = useCallback(() => {
    setLoading(true);
    fetch("/api/market")
      .then((r) => r.json())
      .then((d) => setOffers(d.offers ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadOffers(); }, [loadOffers]);

  // Load enterprises for buy modal too (reuse same list)
  useEffect(() => {
    if (!buyOffer && !modalOpen) return;
    if (enterprises.length > 0) return;
    fetch("/api/enterprises")
      .then((r) => r.json())
      .then((d) => {
        setEnterprises((d.enterprises ?? []).map((e: any) => ({
          id: e.id, name: e.name, cityName: e.cityName,
        })));
      });
  }, [buyOffer, modalOpen, enterprises.length]);


  // Load inventory when enterprise selected
  useEffect(() => {
    if (!form.enterpriseId) { setInventory([]); return; }
    fetch(`/api/enterprises/${form.enterpriseId}/inventory`)
      .then((r) => r.json())
      .then((d) => setInventory(d.inventory ?? []))
      .catch(() => setInventory([]));
  }, [form.enterpriseId]);

  const selectedInv = inventory.find((i) => i.productId === form.productId);

  async function handleSell(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const qty = Number(form.quantity);
    const price = Number(form.price);
    const minOrder = Number(form.minOrder);
    if (!form.enterpriseId || !form.productId || !qty || !price) {
      setFormError("Заповніть всі обов'язкові поля"); return;
    }
    if (selectedInv && qty > selectedInv.quantity) {
      setFormError(`Максимум доступно: ${selectedInv.quantity} ${selectedInv.unit}`); return;
    }
    setSubmitting(true);
    const res = await fetch("/api/market", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enterpriseId: form.enterpriseId,
        productId: form.productId,
        quantity: qty,
        price,
        minOrder,
        daysValid: Number(form.daysValid),
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setFormError(data.error ?? "Помилка"); return; }
    setModalOpen(false);
    setForm({ enterpriseId: "", productId: "", quantity: "", price: "", minOrder: "1", daysValid: "7" });
    loadOffers();
  }

  function openBuy(offer: Offer) {
    setBuyOffer(offer);
    setBuyQty(offer.minOrder);
    setBuyEntId("");
    setBuyError("");
    setBuySuccess("");
  }

  async function handleBuy() {
    if (!buyOffer || !buyEntId || buyQty < 1) { setBuyError("Оберіть підприємство та вкажіть кількість"); return; }
    setBuying(true); setBuyError(""); setBuySuccess("");
    const res = await fetch("/api/market/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offerId: buyOffer.id, quantity: buyQty, buyerEnterpriseId: buyEntId }),
    });
    const data = await res.json();
    setBuying(false);
    if (!res.ok) { setBuyError(data.error ?? "Помилка"); return; }
    setBuySuccess(`✓ Куплено ${buyQty} ${buyOffer.unit} · −${formatNumber(buyQty * buyOffer.price)} ₴`);
    loadOffers();
    setTimeout(() => setBuyOffer(null), 2000);
  }

  const filtered = offers.filter((o) =>
    o.productName.toLowerCase().includes(search.toLowerCase()) ||
    o.sellerName.toLowerCase().includes(search.toLowerCase()) ||
    o.cityName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">B2B Ринок</h1>
          <p className="text-gray-500 text-sm mt-1">
            {offers.length} активних пропозицій між гравцями
          </p>
        </div>
        <Button onClick={() => { setFormError(""); setModalOpen(true); }}>
          <ShoppingCart size={16} /> Виставити товар
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
        <input
          className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          placeholder="Пошук товару, продавця, міста..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Активні пропозиції</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 px-0">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Товар</TableHeader>
                <TableHeader>Місто</TableHeader>
                <TableHeader>Продавець</TableHeader>
                <TableHeader className="text-right">Ціна</TableHeader>
                <TableHeader className="text-right">vs Базова</TableHeader>
                <TableHeader className="text-right">Кількість</TableHeader>
                <TableHeader className="text-right">Мін. замовлення</TableHeader>
                <TableHeader>Дія</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8}><SkeletonTable rows={5} cols={7} /></TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableEmpty>
                  {offers.length === 0
                    ? "На ринку поки немає пропозицій. Виставте свій товар першим!"
                    : "Нічого не знайдено за вашим запитом"}
                </TableEmpty>
              ) : (
                filtered.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <div className="font-medium text-white">{o.productName}</div>
                      <div className="text-xs text-gray-600">{o.unit}</div>
                    </TableCell>
                    <TableCell className="text-gray-400">{o.cityName}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-300">{o.sellerName}</span>
                        {o.isNpc && (
                          <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 whitespace-nowrap">
                            ⭐ NPC
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-600">
                        {o.isNpc ? "Гарантована якість 3.0–4.6" : `Рейтинг ${o.sellerRating.toFixed(0)}`}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <CurrencyDisplay amount={o.price} currency="UAH" size="sm" />
                      <div className="text-xs text-gray-600">/ {o.unit}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <PriceVsBase ratio={o.priceVsBase} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-white">
                      {formatNumber(o.quantity)} {o.unit}
                    </TableCell>
                    <TableCell className="text-right font-mono text-gray-400">
                      {formatNumber(o.minOrder)} {o.unit}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => openBuy(o)}>Купити</Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Buy modal */}
      <Dialog open={!!buyOffer} onClose={() => setBuyOffer(null)} title={`Купити: ${buyOffer?.productName ?? ""}`} size="md">
        {buyOffer && (
          <div className="space-y-4">
            {/* Offer info */}
            <div className="rounded-xl bg-gray-900 border border-gray-800 px-4 py-3 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Продавець</span>
                <span className="text-white font-medium">{buyOffer.sellerName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Місто</span>
                <span className="text-gray-300">{buyOffer.cityName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Ціна / {buyOffer.unit}</span>
                <span className="text-emerald-400 font-bold font-mono">{formatNumber(buyOffer.price)} ₴</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Доступно</span>
                <span className="text-white font-mono">{formatNumber(buyOffer.quantity)} {buyOffer.unit}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Мін. замовлення</span>
                <span className="text-gray-300 font-mono">{formatNumber(buyOffer.minOrder)} {buyOffer.unit}</span>
              </div>
            </div>

            {/* Enterprise selector */}
            <Select
              label="Доставити на підприємство *"
              placeholder="Оберіть підприємство..."
              value={buyEntId}
              onChange={(e) => setBuyEntId(e.target.value)}
              options={enterprises.map((en) => ({ value: en.id, label: `${en.name} (${en.cityName})` }))}
            />

            {/* Quantity */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Кількість ({buyOffer.unit})</label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={buyOffer.minOrder}
                  max={buyOffer.quantity}
                  step={buyOffer.minOrder}
                  value={buyQty}
                  onChange={(e) => setBuyQty(+e.target.value)}
                  className="flex-1 accent-emerald-500"
                />
                <input
                  type="number"
                  min={buyOffer.minOrder}
                  max={buyOffer.quantity}
                  step={1}
                  value={buyQty}
                  onChange={(e) => setBuyQty(Math.max(buyOffer.minOrder, Math.min(buyOffer.quantity, +e.target.value)))}
                  className="w-24 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 font-mono text-center [appearance:textfield]"
                />
              </div>
            </div>

            {/* Total price */}
            <div className="rounded-xl bg-emerald-950/40 border border-emerald-800/40 px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-gray-400">До сплати:</span>
              <span className="text-lg font-bold font-mono text-emerald-400">
                {formatNumber(buyQty * buyOffer.price)} ₴
              </span>
            </div>

            {buyError && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-950/40 border border-red-800/40 rounded-xl px-4 py-3">
                <AlertCircle size={15} /> {buyError}
              </div>
            )}
            {buySuccess && (
              <div className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-950/40 border border-emerald-800/40 rounded-xl px-4 py-3">
                <CheckCircle2 size={15} /> {buySuccess}
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setBuyOffer(null)}>Скасувати</Button>
              <Button
                className="flex-1"
                onClick={handleBuy}
                disabled={buying || !buyEntId || buyQty < buyOffer.minOrder}
              >
                {buying ? <Loader2 size={15} className="animate-spin" /> : <ShoppingCart size={15} />}
                Купити
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Sell modal */}
      <Dialog open={modalOpen} onClose={() => setModalOpen(false)} title="Виставити товар на ринок" size="lg">
        <form onSubmit={handleSell} className="space-y-4">
          <Select
            label="Підприємство *"
            placeholder="Оберіть підприємство..."
            value={form.enterpriseId}
            onChange={(e) => setForm((p) => ({ ...p, enterpriseId: e.target.value, productId: "" }))}
            options={enterprises.map((en) => ({ value: en.id, label: `${en.name} (${en.cityName})` }))}
            required
          />

          {form.enterpriseId && (
            <Select
              label="Товар *"
              placeholder={inventory.length === 0 ? "Склад порожній" : "Оберіть товар..."}
              value={form.productId}
              onChange={(e) => setForm((p) => ({ ...p, productId: e.target.value }))}
              options={inventory.map((i) => ({
                value: i.productId,
                label: `${i.product} — ${formatNumber(i.quantity)} ${i.unit}`,
              }))}
              disabled={inventory.length === 0}
              required
            />
          )}

          {selectedInv && (
            <div className="text-xs text-gray-500 bg-gray-800 rounded-lg px-3 py-2">
              Доступно на складі: <span className="text-white font-medium">{formatNumber(selectedInv.quantity)} {selectedInv.unit}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Кількість *"
              type="number"
              placeholder="0"
              min={1}
              max={selectedInv?.quantity}
              value={form.quantity}
              onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))}
              required
            />
            <Input
              label="Ціна за одиницю (₴) *"
              type="number"
              placeholder="0"
              min={0.01}
              step={0.01}
              value={form.price}
              onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Мін. замовлення"
              type="number"
              placeholder="1"
              min={1}
              value={form.minOrder}
              onChange={(e) => setForm((p) => ({ ...p, minOrder: e.target.value }))}
            />
            <Select
              label="Термін дії"
              value={form.daysValid}
              onChange={(e) => setForm((p) => ({ ...p, daysValid: e.target.value }))}
              options={[
                { value: "1",  label: "1 день" },
                { value: "3",  label: "3 дні" },
                { value: "7",  label: "7 днів" },
                { value: "14", label: "14 днів" },
                { value: "30", label: "30 днів" },
              ]}
            />
          </div>

          {formError && (
            <div className="bg-red-950 border border-red-900 text-red-400 text-sm px-4 py-3 rounded-lg">
              {formError}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setModalOpen(false)}>
              Скасувати
            </Button>
            <Button type="submit" loading={submitting} className="flex-1">
              <ShoppingCart size={14} /> Виставити
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
