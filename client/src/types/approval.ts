export type StageCode = 'SH' | 'GH' | 'DH' | 'IC' | 'PROC' | 'GHFA' | 'CFO';

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

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFail {
  success: false;
  reason: FailReason;
  message: string;
  processedBy?: string;
  processedAt?: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFail;

export interface SubmitResponse {
  success: true;
  decision: 'approve' | 'reject';
  tahap: StageCode;
  nextTahap: StageCode | null;
  nextTahapLabel: string | null;
}

export type SubmitApiResponse = SubmitResponse | ApiFail;