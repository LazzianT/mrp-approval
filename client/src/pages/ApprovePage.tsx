import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApproveActions } from '../components/ApproveActions';
import { Header } from '../components/Header';
import { HistoryList } from '../components/HistoryList';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { MaterialTable } from '../components/MaterialTable';
import { MrpInfo } from '../components/MrpInfo';
import { RejectDialog } from '../components/RejectDialog';
import { StateMessage } from '../components/StateMessage';
import { SummaryCard } from '../components/SummaryCard';
import { useApprovalDetail } from '../hooks/useApprovalDetail';
import { useApprovalSubmit } from '../hooks/useApprovalSubmit';
import { formatDate } from '../utils/formatDate';
import type { ApiFail } from '../types/approval';

export function ApprovePage() {
  const [searchParams] = useSearchParams();
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [closed, setClosed] = useState(false);

  const token = searchParams.get('token');
  const query = useApprovalDetail(token);
  const submit = useApprovalSubmit(token);

  const detail = query.data?.detail ?? null;
  const fail = query.data?.fail ?? null;
  const submitError = submit.state.status === 'error' ? submit.state.message : null;

  const successResult = useMemo(
    () => (submit.state.status === 'success' ? submit.state.result : null),
    [submit.state],
  );

  if (!token) {
    return (
      <Shell>
        <StateMessage
          tone="error"
          title="Tautan tidak lengkap"
          description="Buka kembali tautan approval yang Anda terima melalui WhatsApp."
        />
      </Shell>
    );
  }

  if (closed) {
    return (
      <Shell>
        <StateMessage tone="success" title="Terima kasih" description="Anda dapat menutup halaman ini." />
      </Shell>
    );
  }

  if (successResult) {
    return (
      <Shell>
        <StateMessage
          tone={successResult.decision === 'approve' ? 'success' : 'warning'}
          title={
            successResult.decision === 'approve'
              ? 'Budget Plan berhasil disetujui'
              : 'Budget Plan berhasil ditolak'
          }
          description={
            successResult.decision === 'approve' ? (
              successResult.nextTahap ? (
                <>
                  <p>
                    Tahap berikutnya: <strong>{successResult.nextTahapLabel}</strong>.
                  </p>
                  <p className="mt-1">
                    Notifikasi untuk approver berikutnya dikirim otomatis oleh sistem.
                  </p>
                </>
              ) : (
                <p>Semua tahap approval sudah selesai.</p>
              )
            ) : (
              <p>
                Pengajuan ditolak pada tahap <strong>{successResult.tahap}</strong> dan tidak bergeser
                ke tahap berikutnya.
              </p>
            )
          }
          action={
            <button
              type="button"
              onClick={() => setClosed(true)}
              className="rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
            >
              Tutup
            </button>
          }
        />
      </Shell>
    );
  }

  if (query.isPending) {
    return (
      <Shell>
        <LoadingSkeleton />
      </Shell>
    );
  }

  if (query.isError) {
    return (
      <Shell>
        <StateMessage
          tone="error"
          title="Gagal memuat data"
          description="Tidak dapat terhubung ke server. Periksa koneksi internet Anda lalu coba lagi."
          action={
            <button
              type="button"
              onClick={() => query.refetch()}
              className="rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
            >
              Coba lagi
            </button>
          }
        />
      </Shell>
    );
  }

  if (fail || !detail) {
    return (
      <Shell>
        <FailureState fail={fail} />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="pb-28 lg:pb-0">
        <Header mrpNo={detail.mrpNo} tahapLabel={detail.tahapLabel} />
      </div>

      <div className="space-y-3 p-4 sm:p-6">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div className="space-y-3">
            <MrpInfo
              requester={detail.requester}
              periode={detail.periode}
              jenis={detail.jenis}
              keperluan={detail.keperluan}
              approver={detail.approver}
              expiredAt={formatDate(detail.expiredAt)}
            />
            <SummaryCard total={detail.total} budgetApproved={detail.budgetApproved} />
            <MaterialTable materials={detail.materials} />
            <HistoryList history={detail.history} />
          </div>

          <div className="hidden lg:block">
            <ApproveActions
              expiredAt={detail.expiredAt}
              isSubmitting={submit.isSubmitting}
              submitError={submitError}
              onApprove={submit.approve}
              onReject={() => setRejectDialogOpen(true)}
            />
          </div>
        </div>
      </div>

      {/* Di HP kotak aksi menempel di bawah layar supaya selalu terjangkau ibu jari. */}
      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white px-4 py-3 lg:hidden">
        <ApproveActions
          expiredAt={detail.expiredAt}
          isSubmitting={submit.isSubmitting}
          submitError={submitError}
          onApprove={submit.approve}
          onReject={() => setRejectDialogOpen(true)}
        />
      </div>

      <RejectDialog
        open={rejectDialogOpen}
        note={submit.note}
        error={submit.noteError}
        isSubmitting={submit.isSubmitting}
        onNoteChange={submit.setNote}
        onConfirm={async () => {
          const ok = await submit.reject();
          if (ok) setRejectDialogOpen(false);
        }}
        onCancel={() => setRejectDialogOpen(false)}
      />
    </Shell>
  );
}

function FailureState({ fail }: { fail: ApiFail | null }) {
  const reason = fail?.reason ?? 'invalid';

  if (reason === 'expired') {
    return (
      <StateMessage
        tone="warning"
        title="Tautan approval sudah kedaluwarsa"
        description="Minta pengirim mengirim ulang tautan approval terbaru."
      />
    );
  }

  if (reason === 'already_processed') {
    return (
      <StateMessage
        tone="info"
        title="Budget Plan ini sudah diproses"
        description={
          <>
            <p>Keputusan ini sudah tercatat sebelumnya, jadi tidak ada perubahan lagi.</p>
            {fail?.processedBy && (
              <p className="mt-2">
                Diproses oleh <strong>{fail.processedBy}</strong>
                {fail.processedAt ? ` pada ${formatDate(fail.processedAt)}` : ''}.
              </p>
            )}
          </>
        }
      />
    );
  }

  if (reason === 'not_found') {
    return (
      <StateMessage
        tone="error"
        title="Data Budget Plan tidak ditemukan"
        description="Pastikan tautan dibuka dari pesan WhatsApp terbaru."
      />
    );
  }

  if (reason === 'stage_mismatch') {
    return (
      <StateMessage
        tone="info"
        title="Tahap approval sudah bergeser"
        description="Tautan ini bukan untuk tahap Anda. Tunggu permintaan approval berikutnya."
      />
    );
  }

  return (
    <StateMessage
      tone="error"
      title="Tautan tidak dapat diproses"
      description="Buka kembali tautan dari pesan WhatsApp yang Anda terima. Jika masih gagal, hubungi pengirim pesan."
    />
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto w-full max-w-5xl pb-6">{children}</main>
    </div>
  );
}