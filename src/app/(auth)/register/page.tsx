"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", username: "", companyName: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirm) {
      setError("Паролі не співпадають");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.email,
        username: form.username,
        companyName: form.companyName || `Компанія ${form.username}`,
        password: form.password,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Помилка реєстрації");
      return;
    }

    router.push("/login?registered=1");
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-emerald-400">UA Simulator</h1>
          <p className="text-gray-500 mt-2">Створи новий акаунт</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-2xl p-8 border border-gray-800 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Email</label>
            <input
              type="email" required
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Нікнейм</label>
            <input
              type="text" required minLength={3} maxLength={30}
              value={form.username}
              onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="BusinessKing"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Назва компанії</label>
            <input
              type="text" maxLength={60}
              value={form.companyName}
              onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Моя перша компанія"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Пароль</label>
            <input
              type="password" required minLength={8}
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="мін. 8 символів"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Підтвердження пароля</label>
            <input
              type="password" required
              value={form.confirm}
              onChange={(e) => setForm((p) => ({ ...p, confirm: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-800 text-red-400 text-sm px-4 py-2.5 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white py-2.5 rounded-lg font-semibold transition-colors"
          >
            {loading ? "Реєстрація..." : "Зареєструватись"}
          </button>

          <div className="text-center text-sm text-gray-500">
            <p className="text-xs text-gray-600 mb-2">
              Стартовий баланс: <span className="text-yellow-400">500,000 ₴</span>
            </p>
            Вже є акаунт?{" "}
            <Link href="/login" className="text-emerald-400 hover:text-emerald-300">
              Увійти
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
