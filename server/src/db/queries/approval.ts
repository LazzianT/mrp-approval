import { MRP_HEADER_COLUMNS } from '../../config/mrpColumns.js';
import type { Stage } from '../../config/stages.js';

/**
 * UPDATE dengan guard `WHERE <kolom tanggal tahap ini> IS NULL`.
 * Guard inilah yang membuat approve idempoten dan aman dari race condition:
 * pada dua request bersamaan, hanya satu yang lolos dan rowsAffected = 1.
 * Winner melakukan update, loser melihat rowsAffected = 0.
 *
 * Nama kolom berasal dari config/stages.ts, bukan dari input user, sehingga
 * tidak ada jalur string-concat dari request.
 */
export function buildApproveUpdateSql(stage: Stage): string {
  return `
    UPDATE BMC.dbo.PURCH_MRP
       SET ${stage.nameColumn} = @approverName,
           ${stage.dateColumn} = @approveDate
     WHERE MRPNo = @mrpNo
       AND ${stage.dateColumn} IS NULL`;
}

export interface ApproveUpdateParams {
  mrpNo: string;
  approverName: string;
  approveDate: Date;
}

/**
 * UPDATE status ringkasan. Sendiri (tanpa guard tanggal tahap) karena dipanggil
 * di dalam transaksi yang sama dengan update tahap, setelah update tahap menang.
 */
export function buildStatusUpdateSql(): string {
  return `
    UPDATE BMC.dbo.PURCH_MRP
       SET ${MRP_HEADER_COLUMNS.status} = @status,
           ${MRP_HEADER_COLUMNS.statusInfo} = @statusInfo,
           ${MRP_HEADER_COLUMNS.approval} = @approval,
           ${MRP_HEADER_COLUMNS.approvalInfo} = @approvalInfo
     WHERE MRPNo = @mrpNo`;
}

/**
 * Reject tidak menggeser tahap, jadi tidak ada kolom tahap yang disentuh.
 * TODO: konfirmasi ke tim - belum ada kolom penyimpanan alasan reject
 * (mis. NotesReject atau tabel terpisah PURCH_MRP_REJECT). Sampai ada ketetapan,
 * alasan reject hanya tercatat di log server.
 */
export function buildRejectUpdateSql(): string {
  return `
    UPDATE BMC.dbo.PURCH_MRP
       SET ${MRP_HEADER_COLUMNS.statusInfo} = @statusInfo
     WHERE MRPNo = @mrpNo`;
}