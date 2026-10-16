import type { StageCode } from './config/stages.js';

export interface TokenPayload {
  mrpNo: string;
  tahap: StageCode;
  /** Unix timestamp dalam milidetik. */
  exp: number;
  /** Heks random 16 byte, dipakai mendeteksi pemakaian ulang token. */
  nonce: string;
  /**
   * NIP approver. Opsional, tapi sebaiknya dikirim backend CI karena CI tahu
   * siapa yang menerima pesan WhatsApp. Kalau kosong, nama approver diambil dari
   * kolom tahap yang sudah terisi.
   */
  approverNip?: string;
}

export interface Person {
  nip: string;
  name: string;
}

export interface MrpDetail {
  mrpNo: string;
  jenis: string;
  periode: string;
  requester: Person & { departemen: string };
  keperluan: string;
  total: number;
  budgetApproved: number;
  tahap: StageCode;
  tahapLabel: string;
  approver: Person;
  expiredAt: string;
  materials: MaterialRow[];
  history: HistoryRow[];
}

export interface MaterialRow {
  materialId: string;
  materialName: string;
  qty: number;
  uom: string;
  harga: number;
  total: number;
}

export interface HistoryRow {
  tahap: StageCode;
  tahapLabel: string;
  status: 'approved';
  by: string;
  date: string;
  note: string;
}

export type FailReason =
  | 'expired'
  | 'invalid'
  | 'already_processed'
  | 'not_found'
  | 'stage_mismatch'
  | 'approver_unknown'
  | 'validation_error'
  | 'server_error';

export interface SuccessResponse<T> {
  success: true;
  data: T;
}

export interface FailResponse {
  success: false;
  reason: FailReason;
  message: string;
  /** Data sampingan agar frontend bisa menampilkan konteks, mis. siapa yang sudah memproses. */
  processedBy?: string;
  processedAt?: string;
}

export type ApiResponse<T> = SuccessResponse<T> | FailResponse;