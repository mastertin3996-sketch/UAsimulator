"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function GameError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
      <AlertTriangle size={40} className="text-red-400" />
      <div>
        <p className="text-white font-semibold text-lg">Сталася помилка</p>
        <p className="text-gray-500 text-sm mt-1 max-w-sm">{error.message || "Невідома помилка"}</p>
      </div>
      <button
        onClick={reset}
        className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-sm rounded-xl transition-colors"
      >
        <RefreshCw size={14} /> Спробувати знову
      </button>
    </div>
  );
}
