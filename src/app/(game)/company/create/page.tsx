"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CreateCompanyPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", slogan: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/company", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) { setError(data.error); return; }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="max-w-lg mx-auto mt-12">
      <div className="text-center mb-8">
        <div className="w-14 h-14 bg-emerald-950 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Building2 size={28} className="text-emerald-400" />
        </div>
        <h1 className="text-2xl font-bold text-white">Заснуй компанію</h1>
        <p className="text-gray-500 mt-2 text-sm">
          Обери унікальну назву — вона буде видна всім гравцям на ринку
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Дані компанії</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Назва компанії *"
              placeholder="Наприклад: UkrAgro Holdings"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              hint="3–100 символів, унікальна для всього серверу"
              required
              minLength={3}
              maxLength={100}
            />
            <Input
              label="Слоган (необов'язково)"
              placeholder="Якість, що перевірена часом"
              value={form.slogan}
              onChange={(e) => setForm((p) => ({ ...p, slogan: e.target.value }))}
              maxLength={200}
            />

            {error && (
              <div className="bg-red-950 border border-red-900 text-red-400 text-sm px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Preview */}
            {form.name && (
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Попередній перегляд</p>
                <p className="text-white font-semibold">{form.name}</p>
                {form.slogan && (
                  <p className="text-gray-400 text-sm italic mt-0.5">&ldquo;{form.slogan}&rdquo;</p>
                )}
              </div>
            )}

            <Button type="submit" loading={loading} className="w-full" size="lg">
              <Sparkles size={16} />
              Заснувати компанію
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="mt-4 bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">Стартові умови</p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="text-gray-400">Стартовий капітал</div>
          <div className="text-amber-400 font-mono">50 000 GC</div>
          <div className="text-gray-400">Рейтинг</div>
          <div className="text-white font-mono">100.00</div>
          <div className="text-gray-400">Рівень бренду</div>
          <div className="text-white font-mono">1 / 100</div>
        </div>
      </div>
    </div>
  );
}
