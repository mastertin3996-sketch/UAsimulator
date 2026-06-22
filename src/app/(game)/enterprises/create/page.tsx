"use client";

import Link from "next/link";

export default function CreateEnterprisePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center">
        <span className="text-2xl">🏭</span>
      </div>
      <h1 className="text-xl font-bold text-white">Відкрити підприємство</h1>
      <p className="text-gray-500 text-sm max-w-sm">
        Сторінка відкриття підприємств розробляється. Поки що звернись до адміністратора гри.
      </p>
      <Link href="/enterprises" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm transition-colors">
        Назад до підприємств
      </Link>
    </div>
  );
}
