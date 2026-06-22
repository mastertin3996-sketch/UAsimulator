"use client";

export default function ComingSoon({ title }: { title?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center">
        <span className="text-2xl">🚧</span>
      </div>
      <h1 className="text-xl font-bold text-white">{title ?? "Незабаром"}</h1>
      <p className="text-gray-500 text-sm max-w-sm">
        Ця сторінка розробляється. Завітай пізніше.
      </p>
    </div>
  );
}
