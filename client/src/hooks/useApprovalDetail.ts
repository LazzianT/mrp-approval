import { useQuery } from '@tanstack/react-query';
import { ApiBusinessError, fetchApprovalDetail, type ApprovalRef } from '../api/mrpApproval';
import type { ApiFail, MrpDetail } from '../types/approval';

interface DetailResult {
  detail: MrpDetail | null;
  fail: ApiFail | null;
}

export function useApprovalDetail(ref: ApprovalRef) {
  return useQuery<DetailResult, Error>({
    queryKey: ['mrpApproval', 'detail', ref.token ?? ref.m ?? ''],
    enabled: Boolean(ref.token || ref.m),
    retry: (failureCount, error) => {
      // Kegagalan bisnis (token expired/invalid) tidak akan berubah kalau diulang.
      if (error instanceof ApiBusinessError) return false;
      return failureCount < 2;
    },
    queryFn: async (): Promise<DetailResult> => {
      try {
        return { detail: await fetchApprovalDetail(ref), fail: null };
      } catch (error) {
        if (error instanceof ApiBusinessError) {
          return {
            detail: null,
            fail: {
              success: false,
              reason: error.reason,
              message: error.message,
              ...(error.processedBy ? { processedBy: error.processedBy } : {}),
              ...(error.processedAt ? { processedAt: error.processedAt } : {}),
            },
          };
        }
        throw error;
      }
    },
  });
}