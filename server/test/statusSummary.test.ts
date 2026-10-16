import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Perilaku bawaan setelah examining database sungguhan: kolom Status,
 * Status_Info, Approval, dan Approval_Info milik aplikasi CodeIgniter
 * (Approval berisi angka urut, bukan kode tahap), jadi server tidak boleh
 * menimpanya sebelum aturan status dikonfirmasi.
 */
describe('WRITE_STATUS_SUMMARY', () => {
  let originalFlag: string | undefined;

  beforeEach(() => {
    originalFlag = process.env.WRITE_STATUS_SUMMARY;
    vi.resetModules();
  });

  afterEach(() => {
    process.env.WRITE_STATUS_SUMMARY = originalFlag;
    vi.resetModules();
  });

  it('bernilai false secara bawaan', async () => {
    process.env.WRITE_STATUS_SUMMARY = 'false';
    const { env } = await import('../src/config/env.js');
    expect(env.WRITE_STATUS_SUMMARY).toBe(false);
  });

  it('hanya menulis kolom tahap, tidak menulis kolom ringkasan', async () => {
    process.env.WRITE_STATUS_SUMMARY = 'false';

    const { STAGES } = await import('../src/config/stages.js');
    const { MRP_HEADER_COLUMNS } = await import('../src/config/mrpColumns.js');
    const { submitDecision } = await import('../src/services/approval.js');
    type StageCode = (typeof STAGES)[number]['code'];

    const stages = Object.fromEntries(STAGES.map((s) => [s.code, { name: null, date: null }])) as Record<
      StageCode,
      { name: string | null; date: Date | null }
    >;

    const sql: string[] = [];
    const db = {
      query: async <T,>(query: string): Promise<T[]> => {
        if (query.includes(MRP_HEADER_COLUMNS.mrpDate)) {
          return [
            {
              [MRP_HEADER_COLUMNS.mrpNo]: 'MRP/2026/10/001',
              [MRP_HEADER_COLUMNS.totalHargaApproved]: 0,
              ...Object.fromEntries(STAGES.flatMap((s) => [[s.nameColumn, stages[s.code].name], [s.dateColumn, stages[s.code].date]])),
            } as T,
          ];
        }
        return [];
      },
      execute: async (query: string): Promise<number> => {
        sql.push(query);
        return 1;
      },
      transaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(db),
    };

    const outcome = await submitDecision(db as never, {
      mrpNo: 'MRP/2026/10/001',
      stage: 'SH',
      decision: 'approve',
      approverName: 'Budi Santoso',
    });

    expect(outcome).toEqual({ ok: true, nextTahap: 'IC' });

    const touchedColumns = sql.join('\n');
    // Tahap SH menulis ke kolom utama (Approval_sh*), bukan kolom fallback.
    expect(touchedColumns).toContain('Approval_shName');
    expect(touchedColumns).toContain('Approval_shDate');

    // Tidak boleh menyentuh kolom ringkasan milik aplikasi lama.
    expect(touchedColumns).not.toContain(`SET ${MRP_HEADER_COLUMNS.status} = @status`);
    expect(touchedColumns).not.toContain(MRP_HEADER_COLUMNS.approvalInfo);
  });
});
