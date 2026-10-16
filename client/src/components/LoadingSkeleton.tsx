export function LoadingSkeleton() {
  return (
    <div aria-busy="true" aria-label="Memuat data Budget Plan" className="space-y-3">
      <div className="animate-pulse rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
        <div className="h-4 w-1/3 rounded bg-slate-200" />
        <div className="mt-3 grid grid-cols-2 gap-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-8 rounded bg-slate-100" />
          ))}
        </div>
      </div>
      <div className="animate-pulse rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
        <div className="h-4 w-1/4 rounded bg-slate-200" />
        <div className="mt-3 space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-8 rounded bg-slate-100" />
          ))}
        </div>
      </div>
      <p className="sr-only" role="status">
        Memuat data Budget Plan.
      </p>
    </div>
  );
}