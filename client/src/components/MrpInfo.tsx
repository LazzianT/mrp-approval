interface MrpInfoProps {
  requester: { nip: string; name: string; departemen: string };
  periode: string;
  jenis: string;
  keperluan: string;
  approver: { nip: string; name: string };
  expiredAt: string;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-slate-900">{value || '-'}</dd>
    </div>
  );
}

export function MrpInfo({ requester, periode, jenis, keperluan, approver, expiredAt }: MrpInfoProps) {
  return (
    <section aria-labelledby="info-mrp" className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
      <h2 id="info-mrp" className="mb-3 text-sm font-semibold text-slate-900">
        Informasi Budget Plan
      </h2>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        <Field label="Pemohon" value={requester.name} />
        <Field label="Departemen" value={requester.departemen} />
        <Field label="NIP Pemohon" value={requester.nip} />
        <Field label="Periode" value={periode} />
        <Field label="Jenis" value={jenis} />
        <Field label="Keperluan" value={keperluan} />
        <Field label="Disetujui oleh" value={approver.name} />
        <Field label="Batas waktu" value={expiredAt} />
      </dl>
    </section>
  );
}