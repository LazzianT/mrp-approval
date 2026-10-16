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

export async function fetchApprovalDetail(token: string): Promise<MrpDetail> {
  const response = await http.get<ApiResponse<MrpDetail>>('/mrpApproval/detail', {
    params: { token },
  });

  if (!response.data.success) {
    throw new ApiBusinessError(response.data);
  }
  return response.data.data;
}

export async function submitApproval(
  token: string,
  decision: 'approve' | 'reject',
  note?: string,
): Promise<SubmitApiResponse> {
  const response = await http.post<SubmitApiResponse>('/mrpApproval/submit', {
    token,
    decision,
    ...(note ? { note } : {}),
  });
  return response.data;
}