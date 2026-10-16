import { formatRupiah } from '../utils/formatRupiah';

interface SummaryCardProps {
  total: number;
  budgetApproved: number;
}

export function SummaryCard({ total, budgetApproved }: SummaryCardProps) {
  const overBudget = budgetApproved > 0 && total > budgetApproved;
  const selisih = Math.abs(total - budgetApproved);

  return (
    <section aria-labelledby="ringkasan" className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ringkasan" className="text-sm font-semibold text-slate-900">
          Ringkasan Nilai
        </h2>
        {overBudget && (
          <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
            Over Budget
          </span>
        )}
      </div>

      <dl className="mt-3 space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-xs text-slate-500">Total Pengajuan</dt>
          <dd className="text-right text-base font-semibold text-slate-900 sm:text-lg">{formatRupiah(total)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-xs text-slate-500">Budget Approved</dt>
          <dd className="text-right text-sm font-medium text-slate-700">{formatRupiah(budgetApproved)}</dd>
        </div>
        <div className="border-t border-slate-100 pt-2">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-xs text-slate-500">
              {overBudget ? 'Selisih Lebih' : budgetApproved > 0 ? 'Sisa Budget' : 'Selisih'}
            </dt>
            <dd
              className={`text-right text-sm font-semibold ${
                overBudget ? 'text-red-700' : 'text-emerald-700'
              }`}
            >
              {formatRupiah(selisih)}
            </dd>
          </div>
        </div>
      </dl>
    </section>
  );
}