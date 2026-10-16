import { formatDate } from '../utils/formatDate';
import type { HistoryRow } from '../types/approval';

interface HistoryListProps {
  history: HistoryRow[];
}

export function HistoryList({ history }: HistoryListProps) {
  return (
    <section aria-labelledby="riwayat" className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
      <h2 id="riwayat" className="mb-3 text-sm font-semibold text-slate-900">
        Riwayat Approval
      </h2>

      {history.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
          Belum ada tahap yang selesai. Anda adalah approver pertama.
        </p>
      ) : (
        <ol className="space-y-3">
          {history.map((item) => (
            <li key={item.tahap} className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700"
              >
                &#10003;
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">{item.tahapLabel}</p>
                <p className="break-words text-xs text-slate-600">
                  {item.by} &middot; {formatDate(item.date)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}