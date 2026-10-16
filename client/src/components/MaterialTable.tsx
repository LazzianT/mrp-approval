import { formatNumber, formatRupiah } from '../utils/formatRupiah';
import type { MaterialRow } from '../types/approval';

interface MaterialTableProps {
  materials: MaterialRow[];
}

export function MaterialTable({ materials }: MaterialTableProps) {
  return (
    <section aria-labelledby="material" className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
      <h2 id="material" className="mb-3 text-sm font-semibold text-slate-900">
        Rincian Material
      </h2>

      {materials.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
          Tidak ada rincian material pada Budget Plan ini.
        </p>
      ) : (
        <>
          {/* Tabel penuh di layar lebar; di HP jadi daftar kartu supaya tidak perlu scroll horizontal. */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="py-2 pr-3">Material ID</th>
                  <th scope="col" className="py-2 pr-3">Nama Material</th>
                  <th scope="col" className="py-2 pr-3 text-right">Qty</th>
                  <th scope="col" className="py-2 pr-3">UoM</th>
                  <th scope="col" className="py-2 pr-3 text-right">Harga</th>
                  <th scope="col" className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((row, index) => (
                  <tr key={`${row.materialId}-${index}`} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 font-medium text-slate-900">{row.materialId || '-'}</td>
                    <td className="py-2 pr-3 text-slate-700">{row.materialName || '-'}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-700">{formatNumber(row.qty)}</td>
                    <td className="py-2 pr-3 text-slate-700">{row.uom || '-'}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-700">{formatRupiah(row.harga)}</td>
                    <td className="py-2 text-right font-medium tabular-nums text-slate-900">{formatRupiah(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 sm:hidden">
            {materials.map((row, index) => (
              <li key={`${row.materialId}-${index}`} className="rounded-md border border-slate-200 p-3">
                <p className="text-sm font-medium text-slate-900">{row.materialName || '-'}</p>
                <p className="text-xs text-slate-500">{row.materialId || '-'}</p>
                <dl className="mt-2 space-y-1 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Qty</dt>
                    <dd className="tabular-nums text-slate-800">
                      {formatNumber(row.qty)} {row.uom || ''}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Harga</dt>
                    <dd className="tabular-nums text-slate-800">{formatRupiah(row.harga)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="font-medium text-slate-700">Total</dt>
                    <dd className="font-semibold tabular-nums text-slate-900">{formatRupiah(row.total)}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}