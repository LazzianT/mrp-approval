import { STAGES, getStage, type StageCode } from '../config/stages.js';
import type { HistoryRow, MrpDetail } from '../types.js';

/**
 * Data contoh untuk merapikan tampilan tanpa database.
 * Bentuk datanya sama persis dengan respons /detail di production, jadi apa pun
 * yang terlihat di DUMMY_MODE akan terlihat juga di production.
 */
const MATERIALS = [
  { materialId: 'M001', materialName: 'Bearing 6204', qty: 10, uom: 'PCS', harga: 1_500_000, total: 15_000_000 },
  { materialId: 'M002', materialName: 'Oli Hidrolik ISO VG 46', qty: 40, uom: 'LTR', harga: 275_000, total: 11_000_000 },
  { materialId: 'M003', materialName: 'Seal Kit Pompa Sentrifugal', qty: 3, uom: 'SET', harga: 12_500_000, total: 37_500_000 },
  { materialId: 'M004', materialName: 'Filter Air Pendingin', qty: 8, uom: 'PCS', harga: 1_950_000, total: 15_600_000 },
  { materialId: 'M005', materialName: 'Belt Timing 5M-1200', qty: 12, uom: 'PCS', harga: 875_000, total: 10_500_000 },
  { materialId: 'M006', materialName: 'Grease Lithium EP 2', qty: 24, uom: 'KG', harga: 145_000, total: 3_480_000 },
] as const;

export function buildDummyDetail(mrpNo: string, tahap: StageCode, expMs: number): MrpDetail {
  const stage = getStage(tahap);
  const stageIndex = STAGES.findIndex((s) => s.code === tahap);

  const history: HistoryRow[] = STAGES.slice(0, Math.max(0, stageIndex)).map((s, index) => ({
    tahap: s.code,
    tahapLabel: s.label,
    status: 'approved' as const,
    by: ['Andi Wijaya', 'Ratna Kusuma', 'Bagus Prasetyo', 'Sinta Dewi', 'Yusuf Maulana'][index % 5] as string,
    date: `2026-10-0${index + 1}T09:${String(10 + index).padStart(2, '0')}:00+07:00`,
    note: '',
  }));

  const total = MATERIALS.reduce((sum, row) => sum + row.total, 0);

  return {
    mrpNo,
    jenis: 'Reguler',
    periode: '2026-10',
    requester: { nip: '1234', name: 'Andi Wijaya', departemen: 'Produksi' },
    keperluan: 'Pemeliharaan mesin dan penggantian komponen aus lini 2',
    total,
    // Di bawah total -> badge Over Budget sengaja muncul saat mode ini,
    // supaya tampilan kartu merah bisa langsung dinilai tanpa data sungguhan.
    budgetApproved: total - 10_000_000,
    tahap,
    tahapLabel: stage?.label ?? tahap,
    approver: { nip: '5678', name: 'Budi Santoso' },
    expiredAt: new Date(expMs).toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' }).replace(' ', 'T') + '+07:00',
    materials: MATERIALS.map((row) => ({ ...row })),
    history,
  };
}