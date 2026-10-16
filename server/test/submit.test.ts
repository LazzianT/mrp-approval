import { describe, expect, it } from 'vitest';
import type { Executor, Queryable } from '../src/db/pool.js';
import { MRP_HEADER_COLUMNS } from '../src/config/mrpColumns.js';
import { STAGES, type StageCode } from '../src/config/stages.js';
import {
  APPROVAL_DONE,
  STATUS_APPROVED,
  STATUS_IN_PROGRESS,
  computeStatus,
  submitDecision,
} from '../src/services/approval.js';

interface FakeState {
  stages: Record<StageCode, { name: string | null; date: Date | null }>;
  status: number | null;
  statusInfo: string | null;
  approval: string | null;
  approvalInfo: string | null;
}

const M = 'MRP/2026/10/001';

/**
 * Palsu Executor yang meniru semantik SQL Server untuk UPDATE bertipe
 * `... WHERE MRPNo = @mrpNo AND <kolom tanggal> IS NULL`:
 * guard dievaluasi dan penulisan terjadi tanpa titik await di antaranya,
 * jadi dua writer tidak bisa sama-sama menang.
 */
class FakeDb implements Executor {
  readonly state: FakeState;
  approveWrites = 0;
  statusWrites = 0;
  private headerReads = 0;
  private barrierArmed = false;
  private releaseHeaderReads?: () => void;
  private readonly headerBarrier: Promise<void>;

  constructor(initial?: Partial<Record<StageCode, { name: string | null; date: Date | null }>>) {
    this.state = {
      stages: Object.fromEntries(
        STAGES.map((s) => [s.code, initial?.[s.code] ?? { name: null, date: null }]),
      ) as FakeState['stages'],
      status: null,
      statusInfo: null,
      approval: null,
      approvalInfo: null,
    };

    let resolveBarrier!: () => void;
    this.headerBarrier = new Promise<void>((resolve) => {
      resolveBarrier = resolve;
    });
    this.releaseHeaderReads = resolveBarrier;
  }

  /** Hanya menahan sampai dua pembaca header, untuk memaksa skenario race. */
  armRaceBarrier(): void {
    this.barrierArmed = true;
  }

  private async maybeWaitAtHeader(): Promise<void> {
    if (!this.barrierArmed) return;
    this.headerReads += 1;
    if (this.headerReads === 2) this.releaseHeaderReads?.();
    if (this.headerReads <= 2) await this.headerBarrier;
  }

  private headerRow() {
    const row: Record<string, unknown> = {
      [MRP_HEADER_COLUMNS.mrpNo]: M,
      [MRP_HEADER_COLUMNS.mrpDate]: new Date('2026-10-01'),
      [MRP_HEADER_COLUMNS.jenis]: 'Reguler',
      [MRP_HEADER_COLUMNS.requestor]: '1234',
      [MRP_HEADER_COLUMNS.keperluan]: 'Pemeliharaan mesin',
      [MRP_HEADER_COLUMNS.departId]: 'D01',
      [MRP_HEADER_COLUMNS.tipe]: 'Budget',
      [MRP_HEADER_COLUMNS.totalHargaApproved]: 130000000,
    };
    for (const stage of STAGES) {
      row[stage.nameColumn] = this.state.stages[stage.code].name;
      row[stage.dateColumn] = this.state.stages[stage.code].date;
    }
    return row;
  }

  query = async <T,>(sql: string): Promise<T[]> => {
    if (sql.includes(MRP_HEADER_COLUMNS.mrpDate)) {
      await this.maybeWaitAtHeader();
      return [this.headerRow() as T];
    }
    return [];
  };

  execute = async (sql: string, params: Record<string, unknown> = {}): Promise<number> => {
    if (sql.includes('@approverName')) {
      const nameColumn = /SET (\w+) = @approverName/.exec(sql)?.[1];
      const stage = STAGES.find((s) => s.nameColumn === nameColumn);
      if (!stage) throw new Error(`Kolom tahap tidak dikenal: ${nameColumn}`);

      const current = this.state.stages[stage.code];
      if (current.date !== null) return 0;

      current.name = params.approverName as string;
      current.date = params.approveDate as Date;
      this.approveWrites += 1;
      return 1;
    }

    if (sql.includes(`SET ${MRP_HEADER_COLUMNS.status} = @status`)) {
      this.state.status = params.status as number;
      this.state.statusInfo = params.statusInfo as string;
      this.state.approval = params.approval as string;
      this.state.approvalInfo = params.approvalInfo as string;
      this.statusWrites += 1;
      return 1;
    }

    return 0;
  };

  transaction = async <T,>(fn: (tx: Queryable) => Promise<T>): Promise<T> => fn(this);
}

function fakeWithTohoughStagesApproved(count: number): FakeDb {
  const initial: Partial<Record<StageCode, { name: string | null; date: Date | null }>> = {};
  for (let i = 0; i < count; i += 1) {
    const stage = STAGES[i]!;
    initial[stage.code] = { name: `Approver ${stage.code}`, date: new Date(`2026-10-0${i + 1}`) };
  }
  return new FakeDb(initial);
}

describe('submitDecision - approve', () => {
  it('menulis kolom nama dan tanggal sesuai tahap dari token', async () => {
    const db = fakeWithTohoughStagesApproved(0);
    const outcome = await submitDecision(db, {
      mrpNo: M,
      stage: 'SH',
      decision: 'approve',
      approverName: 'Budi Santoso',
    });

    expect(outcome).toEqual({ ok: true, nextTahap: 'IC' });
    expect(db.state.stages.SH.name).toBe('Budi Santoso');
    expect(db.state.stages.SH.date).toBeInstanceOf(Date);
  });

  it('menulis ke kolom tahap yang benar untuk tahap selain SH', async () => {
    const db = fakeWithTohoughStagesApproved(4);
    const outcome = await submitDecision(db, {
      mrpNo: M,
      stage: 'PROC',
      decision: 'approve',
      approverName: 'Rina Procurement',
    });

    expect(outcome).toEqual({ ok: true, nextTahap: 'GHFA' });
    expect(db.state.stages.PROC.name).toBe('Rina Procurement');
    expect(db.state.stages.GHFA.date).toBeNull();
  });

  it('tahap non-blocking tidak masuk antrean approval', async () => {
    const db = fakeWithTohoughStagesApproved(2);
    const outcome = await submitDecision(db, { mrpNo: M, stage: 'DH', decision: 'approve', approverName: 'Andi' });

    // GH dan DH tampil di halaman, tapi tidak menahan alur (hanya ~14 DH per
    // bulan dan 6 GH total di 39.279 baris), jadi link approval tidak dibuat
    // untuk tahap itu.
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe('stage_mismatch');
    }
    expect(db.state.stages.DH.date).toBeNull();
    expect(db.state.stages.IC.date).toBeNull();
    expect(db.state.stages.IC.name).toBeNull();
  });

  it('tahap blocking setelah tahap non-blocking tetap jadi antrean', async () => {
    const db = fakeWithTohoughStagesApproved(0);
    const outcome = await submitDecision(db, { mrpNo: M, stage: 'SH', decision: 'approve', approverName: 'Andi' });

    expect(outcome).toEqual({ ok: true, nextTahap: 'IC' });
  });

  it('nextTahap null pada tahap terakhir', async () => {
    const db = fakeWithTohoughStagesApproved(STAGES.length - 1);
    const outcome = await submitDecision(db, {
      mrpNo: M,
      stage: 'CFO',
      decision: 'approve',
      approverName: 'CFO outwardly',
    });
    expect(outcome).toEqual({ ok: true, nextTahap: null });
  });

  it('memperbarui status ringkasan: masih proses dan menunjuk tahap berikutnya', async () => {
    const db = fakeWithTohoughStagesApproved(0);
    await submitDecision(db, { mrpNo: M, stage: 'SH', decision: 'approve', approverName: 'Budi' });
    expect(db.state.status).toBe(STATUS_IN_PROGRESS);
    expect(db.state.approval).toBe('IC');
    expect(db.state.approvalInfo).toBe('Internal Control');
  });

  it('status jadi disetujui setelah tahap terakhir terisi', async () => {
    const db = fakeWithTohoughStagesApproved(STAGES.length - 1);
    await submitDecision(db, { mrpNo: M, stage: 'CFO', decision: 'approve', approverName: 'CFO' });
    expect(db.state.status).toBe(STATUS_APPROVED);
    expect(db.state.approval).toBe(APPROVAL_DONE);
  });

  it('approve tahap yang sudah terisi tidak menimpa apa pun', async () => {
    const db = fakeWithTohoughStagesApproved(2);
    const outcome = await submitDecision(db, {
      mrpNo: M,
      stage: 'SH',
      decision: 'approve',
      approverName: 'Budi',
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('already_processed');
    expect(db.approveWrites).toBe(0);
    expect(db.state.stages.SH.name).toBe('Approver SH');
  });

  it('approve tahap yang belum gilirannya dan belum terisi ditolak sebagai stage_mismatch', async () => {
    const db = fakeWithTohoughStagesApproved(2);
    const outcome = await submitDecision(db, {
      mrpNo: M,
      stage: 'PROC',
      decision: 'approve',
      approverName: 'Budi',
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('stage_mismatch');
    expect(db.approveWrites).toBe(0);
  });

  it('nama approver tidak diketahui -> tidak menulis apa pun ke kolom nama', async () => {
    const db = fakeWithTohoughStagesApproved(0);
    const outcome = await submitDecision(db, {
      mrpNo: M,
      stage: 'SH',
      decision: 'approve',
      approverName: null,
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('approver_unknown');
    expect(db.approveWrites).toBe(0);
    expect(db.state.stages.SH.name).toBeNull();
  });

  it('MRP tidak ada -> not_found', async () => {
    const db = new FakeDb();
    db.query = async <T,>(): Promise<T[]> => [];
    const outcome = await submitDecision(db, {
      mrpNo: M,
      stage: 'SH',
      decision: 'approve',
      approverName: 'Budi',
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('not_found');
  });
});

describe('submitDecision - idempoten', () => {
  it('approve kedua kali pada tahap yang sama tidak menimpa dan tidak menggeser tahap', async () => {
    const db = fakeWithTohoughStagesApproved(0);
    const first = await submitDecision(db, {
      mrpNo: M,
      stage: 'SH',
      decision: 'approve',
      approverName: 'Budi Santoso',
    });
    const second = await submitDecision(db, {
      mrpNo: M,
      stage: 'SH',
      decision: 'approve',
      approverName: 'Orang Lain',
    });

    expect(first).toEqual({ ok: true, nextTahap: 'IC' });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe('already_processed');
      expect(second.processedBy).toBe('Budi Santoso');
    }

    expect(db.approveWrites).toBe(1);
    expect(db.state.stages.SH.name).toBe('Budi Santoso');
    expect(db.state.approval).toBe('IC');
  });

  it('approve link lama setelah tahap berikutnya terisi ditolak sebagai already_processed', async () => {
    const db = fakeWithTohoughStagesApproved(2);
    const outcome = await submitDecision(db, {
      mrpNo: M,
      stage: 'SH',
      decision: 'approve',
      approverName: 'Budi',
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe('already_processed');
      expect(outcome.processedBy).toBe('Approver SH');
    }
    expect(db.approveWrites).toBe(0);
  });
});

describe('submitDecision - race condition', () => {
  it('dua klik bersamaan menghasilkan tepat satu update', async () => {
    const db = fakeWithTohoughStagesApproved(0);
    db.armRaceBarrier();

    const [a, b] = await Promise.all([
      submitDecision(db, { mrpNo: M, stage: 'SH', decision: 'approve', approverName: 'Budi' }),
      submitTransactionDuplicate(db),
    ]);

    const winners = [a, b].filter((r) => r.ok);
    const losers = [a, b].filter((r) => !r.ok);

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    if (!losers[0]!.ok) expect(losers[0]!.reason).toBe('already_processed');

    expect(db.approveWrites).toBe(1);
    expect(db.statusWrites).toBe(1);
    expect(db.state.stages.SH.name).toBe('Budi');
    expect(db.state.approval).toBe('IC');
  });

  it('dua penolakan bersamaan tidak mengubah tahap', async () => {
    const db = fakeWithTohoughStagesApproved(0);

    const [a, b] = await Promise.all([
      submitDecision(db, { mrpNo: M, stage: 'SH', decision: 'reject', approverName: 'Budi' }),
      submitDecision(db, { mrpNo: M, stage: 'SH', decision: 'reject', approverName: 'Budi' }),
    ]);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(db.approveWrites).toBe(0);
    expect(db.state.stages.SH.date).toBeNull();
    expect(db.state.approval).toBe('SH');
  });
});

function submitTransactionDuplicate(db: Executor) {
  return submitDecision(db, {
    mrpNo: M,
    stage: 'SH' as StageCode,
    decision: 'approve' as const,
    approverName: 'Budi',
  });
}

describe('computeStatus', () => {
  it('masih proses selama ada tahap kosong', () => {
    const db = fakeWithTohoughStagesApproved(3);
    const states = db.state.stages;
    const result = computeStatus(states);
    expect(result.status).toBe(STATUS_IN_PROGRESS);
    expect(result.approval).toBe('IC');
  });

  it('disetujui saat semua tahap terisi', () => {
    const db = fakeWithTohoughStagesApproved(STAGES.length);
    const result = computeStatus(db.state.stages);
    expect(result.status).toBe(STATUS_APPROVED);
    expect(result.approval).toBe(APPROVAL_DONE);
  });
});