export type StageCode = 'SH' | 'GH' | 'DH' | 'IC' | 'PROC' | 'GHFA' | 'CFO';

export interface Stage {
  code: StageCode;
  label: string;
  /** Kolom nama approver di BMC.dbo.PURCH_MRP. Wajib identik dengan aplikasi CI. */
  nameColumn: string;
  /** Kolom tanggal approval di BMC.dbo.PURCH_MRP. */
  dateColumn: string;
  /**
   * Kalau false, tahap ini tetap ditampilkan tapi tidak menahan alur.
   * Dipakai untuk tahap yang realisasinya nyaris tidak ada, supaya MRP tidak
   * mentok menunggu approval yang tidak pernah dikirim.
   */
  blocking: boolean;
  /** Kolom pengganti kalau kolom utama kosong (mis. tahap SH punya 2 sumber). */
  fallbackNameColumns: readonly string[];
  fallbackDateColumns: readonly string[];
}

/**
 * Pemetaan tahap approval.
 * TIDAK boleh diubah: nama kolom di sini yang dipakai aplikasi CodeIgniter untuk
 * menampilkan badge di halaman listmrp. Mengubahnya membuat badge tidak sinkron.
 *
 * Bukti dari database (audit 2026-10-16, 39.279 baris PURCH_MRP):
 *
 * Tahap 1 punya DUA sumber penulisan yang berjalan paralel:
 *   - Approval_shName / Approval_shDate  -> dipakai ~99% MRP periode 2026-10
 *   - ApprovalMgr_By / ApprovalMgr_Date  -> dipakai ~99% juga, tapi berisi NAMA
 * Keduanya dianggap sah; nama diambil dari yang berisi nama, kalau tidak di-resolve
 * lewat hris_Employee dari NIP.
 *
 * GH dan DH tetap ditampilkan (permintaan proses), tapi TIDAK memblokir:
 *   GH terisi 6 baris dari 39.279 (0,02%), 5 di antaranya Juli 2026
 *   DH terisi 54 baris (0,14%), ~14 per bulan - sporadis dan manual
 * Kalau keduanya jadi blocker, setiap MRP baru akan mentok di tahap GH.
 */
export const STAGES: readonly Stage[] = [
  {
    code: 'SH',
    label: 'Section Head',
    nameColumn: 'Approval_shName',
    dateColumn: 'Approval_shDate',
    blocking: true,
    fallbackNameColumns: ['ApprovalMgr_By'],
    fallbackDateColumns: ['ApprovalMgr_Date'],
  },
  {
    code: 'GH',
    label: 'Group Head',
    nameColumn: 'Approval_ghName',
    dateColumn: 'Approval_ghDate',
    blocking: false,
    fallbackNameColumns: [],
    fallbackDateColumns: [],
  },
  {
    code: 'DH',
    label: 'Dept. Head',
    nameColumn: 'Approval_dhName',
    dateColumn: 'Approval_dhDate',
    blocking: false,
    fallbackNameColumns: [],
    fallbackDateColumns: [],
  },
  {
    code: 'IC',
    label: 'Internal Control',
    nameColumn: 'ApprovalIc_By',
    dateColumn: 'ApprovalIc_Date',
    blocking: true,
    fallbackNameColumns: [],
    fallbackDateColumns: [],
  },
  {
    code: 'PROC',
    label: 'Koor. Procurement',
    nameColumn: 'ApprovalProc_By',
    dateColumn: 'ApprovalProc_Date',
    blocking: true,
    fallbackNameColumns: [],
    fallbackDateColumns: [],
  },
  {
    code: 'GHFA',
    label: 'Group Head Fin-Acc',
    nameColumn: 'ApprovalGhFa_By',
    dateColumn: 'ApprovalGhFa_Date',
    blocking: true,
    fallbackNameColumns: [],
    fallbackDateColumns: [],
  },
  {
    code: 'CFO',
    label: 'Dept Head Finance',
    nameColumn: 'ApprovalCfo_By',
    dateColumn: 'ApprovalCfo_Date',
    blocking: true,
    fallbackNameColumns: [],
    fallbackDateColumns: [],
  },
] as const;

/** Tahap yang benar-benar menahan alur approval. */
export const BLOCKING_STAGES: readonly Stage[] = STAGES.filter((s) => s.blocking);

const STAGE_BY_CODE = new Map<string, Stage>(STAGES.map((s) => [s.code, s]));

export function getStage(code: string): Stage | undefined {
  return STAGE_BY_CODE.get(code.toUpperCase());
}

export function isStageCode(value: string): value is StageCode {
  return STAGE_BY_CODE.has(value.toUpperCase());
}

export function stageIndex(code: string): number {
  return STAGES.findIndex((s) => s.code === code.toUpperCase());
}

export const DEFAULT_STAGE: StageCode = 'SH';