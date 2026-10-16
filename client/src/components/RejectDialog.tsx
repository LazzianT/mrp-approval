import { useId } from 'react';

interface RejectDialogProps {
  open: boolean;
  note: string;
  error: string | null;
  isSubmitting: boolean;
  onNoteChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Dialog konfirmasi penolakan. Tongbol aksi memakai type="button" dengan handler JS,
 * bukan submit form.
 */
export function RejectDialog({ open, note, error, isSubmitting, onNoteChange, onConfirm, onCancel }: RejectDialogProps) {
  const textareaId = useId();

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reject-dialog-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <h2 id="reject-dialog-title" className="text-base font-semibold text-slate-900">
          Tolak Budget Plan
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Sertakan alasan agar pemohon dapat memperbaiki pengajuan.
        </p>

        <label htmlFor={textareaId} className="mt-3 block text-xs font-medium text-slate-700">
          Alasan penolakan
        </label>
        <textarea
          id={textareaId}
          name="alasanPenolakanDialog"
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          rows={4}
          maxLength={2000}
          required
          aria-required="true"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${textareaId}-error` : undefined}
          disabled={isSubmitting}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/40 disabled:bg-slate-50"
        />
        {error && (
          <p id={`${textareaId}-error`} role="alert" className="mt-1 text-xs text-red-700">
            {error}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1 rounded-md border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-60"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2 disabled:opacity-60"
          >
            {isSubmitting && (
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
              />
            )}
            Tolak
          </button>
        </div>
      </div>
    </div>
  );
}