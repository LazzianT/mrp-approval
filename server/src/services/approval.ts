import { buildApproveUpdateSql, buildStatusUpdateSql } from '../db/queries/approval.js';
import type { Executor } from '../db/pool.js';
import {
  isBlank,
  isStageApproved,
  nextPendingStage,
  numberOrZero,
  periodeFrom,
  selectDepartmentName,
  selectEmployeeByNip,
  selectMaterials,
  selectMrpHeader,
  selectMrpNote,
  stageLabelOf,
  toWibIso,
  trimmed,
  type StageState,
} from '../db/queries/mrp.js';
import { STAGES, getStage, type StageCode } from '../config/stages.js';
import { env } from '../config/env.js';
import type { HistoryRow, MrpDetail } from '../types.js';

/**
 * Angka Status mengikuti aplikasi CodeIgniter (method update_approvalmrp()).
 * Acuan yang disebutkan di spesifikasi: 3 = masih proses approval,
 * 4 = sudah disetujui direktur, 5 = selesai/ditutup.
 *
 * TODO: konfirmasi ke tim - angka 5 (selesai/ditutup) belum terverifikasi dari
 * update_approvalmrp(), termasuk kapan sebuah MRP dianggap "ditutup" dan apakah
 * ada tahap direktur setelah CFO. Jangan ubah nilai di sini tanpa konfirmasi;
 * seluruh penentuan status hanya melewati fungsi computeStatus() ini.
 */
export const STATUS_IN_PROGRESS = 3;
export const STATUS_APPROVED = 4;
export const STATUS_CLOSED = 5;

export const STATUS_INFO_IN_PROGRESS = 'Proses Approval';
export const STATUS_INFO_APPROVED = 'Disetujui';
export const STATUS_INFO_REJECTED = 'Ditolak';

export const APPROVAL_DONE = 'DONE';

export interface StatusResult {
  status: number;
  statusInfo: string;
  approval: string;
  approvalInfo: string;
}

/**
 * Status dihitung dari tahapan mana saja yang benar-benar terisi, bukan dari
 * form yang sedang diisi.
 */
export function computeStatus(states: StageState): StatusResult {
  const pending = nextPendingStage(states);

  if (pending === null) {
    return {
      status: STATUS_APPROVED,
      statusInfo: STATUS_INFO_APPROVED,
      approval: APPROVAL_DONE,
      approvalInfo: 'Selesai',
    };
  }

  return {
    status: STATUS_IN_PROGRESS,
    statusInfo: STATUS_INFO_IN_PROGRESS,
    approval: pending,
    approvalInfo: stageLabelOf(pending),
  };
}

export interface LoadDetailResult {
  ok: boolean;
  detail?: MrpDetail;
  reason?: 'not_found' | 'already_processed' | 'stage_mismatch';
  message?: string;
  processedBy?: string;
  processedAt?: string;
}

export async function loadDetail(
  db: Executor,
  mrpNo: string,
  tokenStage: StageCode,
  exp: number,
  approverNip?: string,
): Promise<LoadDetailResult> {
  const header = await selectMrpHeader(db, mrpNo);
  if (!header) {
    return { ok: false, reason: 'not_found', message: 'Data MRP tidak ditemukan.' };
  }

  const states = header.stages;
  const pending = nextPendingStage(states);

  if (pending === null) {
    const last = STAGES[STAGES.length - 1]!;
    const lastState = states[last.code];
    return {
      ok: false,
      reason: 'already_processed',
      message: 'Seluruh tahap approval sudah selesai diproses.',
      processedBy: lastState.name ?? '-',
      processedAt: toWibIso(lastState.date),
    };
  }

  if (pending !== tokenStage) {
    return {
      ok: false,
      reason: 'stage_mismatch',
      message: `Tautan ini bukan untuk tahap ${stageLabelOf(tokenStage)}. Saat ini menunggu ${stageLabelOf(pending)}.`,
    };
  }

  const [note, materials, requester, approverRow, department] = await Promise.all([
    selectMrpNote(db, mrpNo),
    selectMaterials(db, mrpNo),
    selectEmployeeByNip(db, header.requestor ?? ''),
    resolveApprover(db, mrpNo, tokenStage, approverNip),
    selectDepartmentName(db, header.departId ?? ''),
  ]);

  const requesterDept =
    department ??
    (requester?.departId ? await selectDepartmentName(db, requester.departId) : null);

  const history = buildHistory(states);
  const total = note?.total ?? 0;

  return {
    ok: true,
    detail: {
      mrpNo: header.mrpNo,
      jenis: header.jenis ?? '-',
      periode: periodeFrom(header.mrpDate),
      requester: {
        nip: requester?.nip ?? header.requestor ?? '-',
        name: requester?.name ?? '-',
        departemen: requesterDept ?? '-',
      },
      keperluan: header.keperluan ?? '-',
      total,
      // TotalHargaApproved baru terisi setelah tahap approval berjalan.
      // Sebelum itu, angka budget yang sah adalah PURCH_MRP_NOTE.Total
      // (dipakai juga sebagai pembanding di aplikasi CI lama).
      budgetApproved: numberOrZero(header.totalHargaApproved ?? note?.total),
      tahap: tokenStage,
      tahapLabel: stageLabelOf(tokenStage),
      approver: approverRow,
      expiredAt: new Date(exp).toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' }).replace(' ', 'T') + '+07:00',
      materials,
      history,
    },
  };
}

/**
 * Approver yang tampil di halaman: dari NIP di token (backend CI tahu siapa
 * penerima pesan WhatsApp), kalau tidak ada dari kolom tahap yang sudah terisi.
 */
async function resolveApprover(
  db: Executor,
  mrpNo: string,
  stageCode: StageCode,
  approverNip?: string,
): Promise<{ nip: string; name: string }> {
  if (approverNip) {
    const employee = await selectEmployeeByNip(db, approverNip);
    if (employee?.name) return { nip: employee.nip, name: employee.name };
  }

  const stage = getStage(stageCode);
  if (!stage) return { nip: '-', name: '-' };

  const rows = await db.query<Record<string, unknown>>(
    `SELECT TOP 1 ${stage.nameColumn} AS approverName FROM BMC.dbo.PURCH_MRP WHERE MRPNo = @mrpNo`,
    { mrpNo },
  );
  const prefilled = trimmed(rows[0]?.approverName);
  if (!isBlank(prefilled)) {
    return { nip: '-', name: prefilled };
  }
  return { nip: '-', name: '-' };
}

function buildHistory(states: StageState): HistoryRow[] {
  const rows: HistoryRow[] = [];
  for (const stage of STAGES) {
    if (!isStageApproved(states, stage.code)) continue;
    const state = states[stage.code];
    rows.push({
      tahap: stage.code,
      tahapLabel: stage.label,
      status: 'approved',
      by: state.name ?? '-',
      date: toWibIso(state.date),
      note: '',
    });
  }
  return rows;
}

export interface SubmitParams {
  mrpNo: string;
  stage: StageCode;
  decision: 'approve' | 'reject';
  /** null berarti nama approver tidak dapat dipastikan, lihat resolveApproverName. */
  approverName: string | null;
  note?: string;
}

export type SubmitOutcome =
  | { ok: true; nextTahap: StageCode | null }
  | { ok: false; reason: 'not_found' | 'already_processed' | 'stage_mismatch' | 'approver_unknown'; message: string; processedBy?: string; processedAt?: string };

/**
 * Menulis keputusan approval ke kolom tahap yang sesuai.
 *
 * Anti race condition: UPDATE memakai guard `WHERE <kolom tanggal tahap> IS NULL`.
 * Dua request bersamaan -> tepat satu rowsAffected = 1, sisanya 0 dan dilaporkan
 * sebagai already_processed. Transaksi memastikan update status konsisten dengan
 * update tahap.
 */
export async function submitDecision(db: Executor, params: SubmitParams): Promise<SubmitOutcome> {
  const stage = getStage(params.stage);
  if (!stage) {
    return { ok: false, reason: 'stage_mismatch', message: 'Tahap approval tidak dikenal.' };
  }

  return db.transaction(async (tx) => {
    const header = await selectMrpHeader(tx, params.mrpNo);
    if (!header) {
      return { ok: false, reason: 'not_found', message: 'Data MRP tidak ditemukan.' };
    }

    const states = header.stages;
    const pending = nextPendingStage(states);

    if (pending === null) {
      const last = STAGES[STAGES.length - 1]!;
      const lastState = states[last.code];
      return {
        ok: false,
        reason: 'already_processed',
        message: 'Seluruh tahap approval sudah selesai diproses.',
        processedBy: lastState.name ?? '-',
        processedAt: toWibIso(lastState.date),
      };
    }

    if (pending !== params.stage) {
      // Tahap di token sudah terisi = link ini dipakai, bukan link yang salah.
      // Balas already_processed supaya klik ganda tidak terlihat seperti error.
      if (isStageApproved(states, params.stage)) {
        const done = states[params.stage];
        return {
          ok: false,
          reason: 'already_processed',
          message: `Approval tahap ${stageLabelOf(params.stage)} sudah diproses sebelumnya.`,
          processedBy: done.name ?? '-',
          processedAt: toWibIso(done.date),
        };
      }

      return {
        ok: false,
        reason: 'stage_mismatch',
        message: `Tahap yang sedang menunggu adalah ${stageLabelOf(pending)}.`,
      };
    }

    if (params.decision === 'reject') {
      if (env.WRITE_STATUS_SUMMARY) {
        await tx.execute(buildStatusUpdateSql(), {
          mrpNo: params.mrpNo,
          status: STATUS_IN_PROGRESS,
          statusInfo: STATUS_INFO_REJECTED,
          approval: pending,
          approvalInfo: stageLabelOf(pending),
        });
      }
      return { ok: true, nextTahap: null };
    }

    // Menulis placeholder seperti "-" ke kolom nama akan merusak badge di listmrp,
    // jadi lebih baik tolak dengan pesan yang bisa ditindaklanjuti.
    if (!params.approverName) {
      return {
        ok: false,
        reason: 'approver_unknown',
        message: 'Nama approver tidak dapat dipastikan. Minta tautan approval dibuat ulang dengan NIP approver.',
      };
    }

    const approveDate = new Date();
    const rowsAffected = await tx.execute(buildApproveUpdateSql(stage), {
      mrpNo: params.mrpNo,
      approverName: params.approverName,
      approveDate,
    });

    if (rowsAffected === 0) {
      return {
        ok: false,
        reason: 'already_processed',
        message: 'Approval ini sudah diproses sebelumnya.',
        processedBy: states[stage.code].name ?? '-',
        processedAt: toWibIso(states[stage.code].date),
      };
    }

    states[stage.code] = { name: params.approverName, date: approveDate };
    const next = computeStatus(states);

    if (env.WRITE_STATUS_SUMMARY) {
      await tx.execute(buildStatusUpdateSql(), {
        mrpNo: params.mrpNo,
        status: next.status,
        statusInfo: next.statusInfo,
        approval: next.approval,
        approvalInfo: next.approvalInfo,
      });
    } else {
      // Kolom ringkasan dibiarkan apa adanya supaya tidak merusak listmrp;
      // aplikasi CodeIgniter tetap menjadi pemilik kolom Status/Approval.
      console.log(
        `[mrp-approval] status ringkasan tidak ditulis (WRITE_STATUS_SUMMARY=false). ` +
          `mrpNo=${params.mrpNo} tahap=${params.stage} berikutnya=${next.approval}`,
      );
    }

    return { ok: true, nextTahap: nextPendingStage(states) };
  });
}

/**
 * Nama approver yang akan ditulis ke kolom tahap.
 * Urutan: NIP dari token (yang dikirim backend CI) -> nilai kolom tahap yang
 * sudah terisi -> null kalau tidak ada. null berarti jangan menulis apa pun,
 * karena kolom yang terisi akan dipakai badge di halaman listmrp.
 */
export async function resolveApproverName(
  db: Executor,
  mrpNo: string,
  stage: StageCode,
  approverNip?: string,
): Promise<string | null> {
  if (approverNip) {
    const employee = await selectEmployeeByNip(db, approverNip);
    if (employee?.name) return employee.name;
  }

  const existing = await resolveApprover(db, mrpNo, stage);
  return existing.name !== '-' ? existing.name : null;
}