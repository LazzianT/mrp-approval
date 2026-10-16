import { formatRemaining } from '../utils/formatDate';

interface ApproveActionsProps {
  expiredAt: string;
  isSubmitting: boolean;
  submitError: string | null;
  onApprove: () => void;
  onReject: () => void;
}

/**
 * Kotak aksi: Setujui dan Tolak. Input alasan penolakan ada di RejectDialog,
 * jadi di sini tidak ada textarea kedua yang bisa membingungkan.
 */
export function ApproveActions({
  expiredAt,
  isSubmitting,
  submitError,
  onApprove,
  onReject,
}: ApproveActionsProps) {
  return (
    <div className="lg:sticky lg:top-4">
      <section
        aria-labelledby="aksi"
        className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      >
        <h2 id="aksi" className="text-sm font-semibold text-slate-900">
          Keputusan Anda
        </h2>
        <p className="mt-1 text-xs text-slate-500">Tautan berlaku {formatRemaining(expiredAt)}.</p>

        <div aria-live="polite" className="mt-3">
          {submitError && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">
              {submitError}
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onApprove}
            disabled={isSubmitting}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting && (
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
              />
            )}
            Setujui
          </button>

          <button
            type="button"
            onClick={onReject}
            disabled={isSubmitting}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-red-600 px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Tolak
          </button>
        </div>
      </section>
    </div>
  );
}