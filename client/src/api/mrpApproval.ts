import { http } from './http';
import type { ApiFail, ApiResponse, MrpDetail, SubmitApiResponse } from '../types/approval';

export class ApiBusinessError extends Error {
  readonly reason: ApiFail['reason'];
  readonly processedBy?: string;
  readonly processedAt?: string;

  constructor(fail: ApiFail) {
    super(fail.message);
    this.name = 'ApiBusinessError';
    this.reason = fail.reason;
    this.processedBy = fail.processedBy;
    this.processedAt = fail.processedAt;
  }
}

/**
 * Cara untuk sampai ke sebuah MRP.
 * - `token`: cara resmi, hasil createLink dari backend CI (signed, 72 jam).
 * - `m`: SEMENTARA (QA), nomor MRP terenkripsi AES-256-GCM oleh backend CI.
 */
export interface ApprovalRef {
  token?: string | null;
  m?: string | null;
}

function refParams(ref: ApprovalRef): Record<string, string> {
  return ref.token ? { token: ref.token } : { m: ref.m ?? '' };
}

export async function fetchApprovalDetail(ref: ApprovalRef): Promise<MrpDetail> {
  const response = await http.get<ApiResponse<MrpDetail>>('/mrpApproval/detail', {
    params: refParams(ref),
  });

  if (!response.data.success) {
    throw new ApiBusinessError(response.data);
  }
  return response.data.data;
}

export async function submitApproval(
  ref: ApprovalRef,
  decision: 'approve' | 'reject',
  note?: string,
): Promise<SubmitApiResponse> {
  const response = await http.post<SubmitApiResponse>('/mrpApproval/submit', {
    ...refParams(ref),
    decision,
    ...(note ? { note } : {}),
  });
  return response.data;
}