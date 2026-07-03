"use client";

import { useEffect, useState } from "react";

export default function B2bTab({ enterpriseId }: { enterpriseId: string }) {
  const [agreements, setAgreements] = useState<{
    id: string; isActive: boolean; quantityPerTick: number;
    totalTransferred: number; product: { sku: string; nameUa: string };
    sourceEnterprise: { id: string; name: string }; targetEnterprise: { id: string; name: string };
  }[]>([]);
  const [allEnterprises, setAllEnterprises] = useState<{ id: string; name: string; type: string }[]>([]);
  const [invProducts, setInvProducts] = useState<{ sku: string; nameUa: string }[]>([]);
  const [form, setForm] = useState({ targetId: "", productSku: "", qty: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = () => {
    fetch("/api/b2b-transfer").then(r => r.ok ? r.json() : null).then(d => setAgreements(d?.agreements ?? [])).catch(() => {});
  };
  useEffect(() => {
    reload();
    fetch("/api/enterprises").then(r => r.ok ? r.json() : null).then(d => setAllEnterprises(d?.enterprises ?? [])).catch(() => {});
    fetch("/api/products?take=100").then(r => r.ok ? r.json() : null).then(d => setInvProducts(d?.products ?? [])).catch(() => {});
  }, []);

  const create = async () => {
    if (!form.targetId || !form.productSku || !form.qty) return;
    setLoading(true); setMsg(null);
    const r = await fetch("/api/b2b-transfer", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceEnterpriseId: enterpriseId, targetEnterpriseId: form.targetId, productSku: form.productSku, quantityPerTick: parseFloat(form.qty), pricePerUnit: 0 }),
    });
    const d = await r.json();
    setMsg(r.ok ? `✓ ${d.message}` : `✗ ${d.error}`);
    if (r.ok) { reload(); setForm({ targetId: "", productSku: "", qty: "" }); }
    setLoading(false);
  };
  const deactivate = async (id: string) => {
    const r = await fetch(`/api/b2b-transfer?id=${id}`, { method: "DELETE" });
    const d = await r.json();
    setMsg(r.ok ? `✓ ${d.message}` : `✗ ${d.error}`);
    if (r.ok) reload();
  };

  const myAgreements = agreements.filter(a => a.sourceEnterprise.id === enterpriseId || a.targetEnterprise.id === enterpriseId);
  const others = allEnterprises.filter(e => e.id !== enterpriseId);

  return (
    <div className="space-y-4 p-1">
      <div className="rounded-lg border border-purple-900/40 bg-purple-950/10 p-3 space-y-2">
        <p className="text-xs font-semibold text-purple-400">Новий автотрансфер B2B</p>
        <div className="grid grid-cols-2 gap-2">
          <select value={form.targetId} onChange={e => setForm(p => ({ ...p, targetId: e.target.value }))}
            className="col-span-2 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500">
            <option value="">Ціль (підприємство)</option>
            {others.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <select value={form.productSku} onChange={e => setForm(p => ({ ...p, productSku: e.target.value }))}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500">
            <option value="">Товар</option>
            {invProducts.map(p => <option key={p.sku} value={p.sku}>{p.nameUa}</option>)}
          </select>
          <input type="number" placeholder="Кількість/день" value={form.qty} onChange={e => setForm(p => ({ ...p, qty: e.target.value }))}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500" />
        </div>
        <button onClick={create} disabled={loading || !form.targetId || !form.productSku || !form.qty}
          className="w-full py-1.5 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white text-xs rounded">
          {loading ? "..." : "Створити автотрансфер"}
        </button>
        {msg && <p className={`text-xs ${msg.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>{msg}</p>}
      </div>
      {myAgreements.length > 0 && (
        <div className="space-y-1.5">
          {myAgreements.map(a => (
            <div key={a.id} className="flex items-center justify-between text-xs border border-gray-800 rounded p-2">
              <div>
                <span className="font-mono text-purple-300">{a.product.sku}</span>
                <span className="text-gray-400 ml-2">x{a.quantityPerTick}/день</span>
                <span className="text-gray-600 ml-2">{a.sourceEnterprise.name} → {a.targetEnterprise.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600 text-[10px]">{a.totalTransferred.toFixed(0)} перенесено</span>
                {a.isActive && a.sourceEnterprise.id === enterpriseId
                  ? <button onClick={() => deactivate(a.id)} className="text-red-500 hover:text-red-400 text-[10px]">Зупинити</button>
                  : <span className="text-gray-600 text-[10px]">{a.isActive ? "активна" : "зупинена"}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
