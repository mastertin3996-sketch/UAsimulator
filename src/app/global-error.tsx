"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="uk">
      <body className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <h1 className="text-xl font-semibold">Щось пішло не так</h1>
          <p className="text-gray-400 text-sm">
            Помилку вже зафіксовано. Спробуйте оновити сторінку.
          </p>
          <button
            onClick={() => reset()}
            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 transition-colors"
          >
            Спробувати ще раз
          </button>
        </div>
      </body>
    </html>
  );
}
