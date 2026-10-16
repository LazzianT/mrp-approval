import {
  MRP_HEADER_COLUMNS,
  MRP_MATERIAL_COLUMNS,
  MRP_MATERIAL_NAME_SOURCE,
  MRP_NOTE_COLUMNS,
  materialColumnsArePlaceholder,
} from '../../config/mrpColumns.js';
import { STAGES, getStage, type StageCode } from '../../config/stages.js';
import type { Queryable } from '../pool.js';
import type { MaterialRow } from '../../types.js';

/** Nilai tahap yang sudah terisi, diambil dari kolom tanggal masing-masing tahap. */
export type StageState = Record<StageCode, { name: string | null; date: Date | string | null }>;

const PURCH_MRP_TABLE = 'BMC.dbo.PURCH_MRP';

/** Ditampilkan di UI kalau nama material belum dikonfigurasi, bukan data palsu. */
export const MATERIAL_NAME_NOT_CONFIGURED = '(nama material belum dikonfigurasi)';

export interface MrpHeader {
  mrpNo: string;
  mrpDate: Date | string | null;
  jenis: string | null;
  requestor: string | null;
  keperluan: string | null;
  departId: string | null;
  tipe: string | null;
  status: string | number | null;
  statusInfo: string | null;
  approval: string | null;
  approvalInfo: string | null;
  totalHargaApproved: number | null;
  stages: StageState;
}

/**
 * Semua kolom yang dibutuhkan untuk membaca status tiap tahap: kolom utama
 * plus kolom fallback (tahap SH punya dua sumber penulisan yang berjalan paralel).
 */
function selectStageColumns(): string {
  const columns: string[] = [];
  for (const s of STAGES) {
    columns.push(s.nameColumn, s.dateColumn, ...s.fallbackNameColumns, ...s.fallbackDateColumns);
  }
  return [...new Set(columns)].join(', ');
}

function firstFilled(row: Record<string, unknown>, columns: readonly string[]): string | null {
  for (const column of columns) {
    const value = row[column];
    if (!isBlank(value)) return value as string;
  }
  return null;
}

function firstFilledDate(
  row: Record<string, unknown>,
  columns: readonly string[],
): Date | string | null {
  for (const column of columns) {
    const value = row[column];
    if (!isBlank(value)) return value as Date | string;
  }
  return null;
}

export async function selectMrpHeader(db: Queryable, mrpNo: string): Promise<MrpHeader | null> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT MRPNo, MRPDate, Jenis, Requestor, Keperluan, DepartId, Tipe,
            Status, Status_Info, Approval, Approval_Info, TotalHargaApproved,
            ${selectStageColumns()}
       FROM ${PURCH_MRP_TABLE}
      WHERE MRPNo = @mrpNo`,
    { mrpNo },
  );

  const row = rows[0];
  if (!row) return null;
  return mapHeaderRow(row);
}

function mapHeaderRow(row: Record<string, unknown>): MrpHeader {
  const stages = {} as StageState;
  for (const stage of STAGES) {
    const name = isBlank(row[stage.nameColumn])
      ? firstFilled(row, stage.fallbackNameColumns)
      : (row[stage.nameColumn] as string | null);
    const date = isBlank(row[stage.dateColumn])
      ? firstFilledDate(row, stage.fallbackDateColumns)
      : (row[stage.dateColumn] as Date | string | null);
    stages[stage.code] = { name: name ?? null, date: date ?? null };
  }

  return {
    mrpNo: String(row[MRP_HEADER_COLUMNS.mrpNo] ?? ''),
    mrpDate: (row[MRP_HEADER_COLUMNS.mrpDate] as Date | string | null) ?? null,
    jenis: (row[MRP_HEADER_COLUMNS.jenis] as string | null) ?? null,
    requestor: (row[MRP_HEADER_COLUMNS.requestor] as string | null) ?? null,
    keperluan: (row[MRP_HEADER_COLUMNS.keperluan] as string | null) ?? null,
    departId: (row[MRP_HEADER_COLUMNS.departId] as string | null) ?? null,
    tipe: (row[MRP_HEADER_COLUMNS.tipe] as string | null) ?? null,
    status: (row[MRP_HEADER_COLUMNS.status] as string | number | null) ?? null,
    statusInfo: (row[MRP_HEADER_COLUMNS.statusInfo] as string | null) ?? null,
    approval: (row[MRP_HEADER_COLUMNS.approval] as string | null) ?? null,
    approvalInfo: (row[MRP_HEADER_COLUMNS.approvalInfo] as string | null) ?? null,
    totalHargaApproved: numberOrNull(row[MRP_HEADER_COLUMNS.totalHargaApproved]),
    stages,
  };
}

export interface MrpNote {
  total: number | null;
  note: string | null;
  departId: string | null;
}

export async function selectMrpNote(db: Queryable, mrpNo: string): Promise<MrpNote | null> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT TOP 1 ${MRP_NOTE_COLUMNS.total} AS total,
            ${MRP_NOTE_COLUMNS.note} AS note,
            ${MRP_NOTE_COLUMNS.departId} AS departId
       FROM BMC.dbo.PURCH_MRP_NOTE
      WHERE MRPNo = @mrpNo`,
    { mrpNo },
  );

  const row = rows[0];
  if (!row) return null;
  return {
    total: numberOrNull(row.total),
    note: (row.note as string | null) ?? null,
    departId: (row.departId as string | null) ?? null,
  };
}

export async function selectMaterials(db: Queryable, mrpNo: string): Promise<MaterialRow[]> {
  const c = MRP_MATERIAL_COLUMNS;
  const nameSource = MRP_MATERIAL_NAME_SOURCE;
  const nameConfigured = !materialColumnsArePlaceholder();

  const selectedColumns = [
    `mrp.${c.materialId} AS materialId`,
    nameConfigured
      ? `${nameSource.alias}.${nameSource.column} AS materialName`
      : `CAST(NULL AS nvarchar(255)) AS materialName`,
    `mrp.${c.qty} AS qty`,
    `mrp.${c.uom} AS uom`,
    `mrp.${c.harga} AS harga`,
    `mrp.${c.total} AS total`,
  ].join(', ');

  const join = nameConfigured
    ? `LEFT JOIN ${nameSource.table} ${nameSource.alias} ON ${nameSource.joinOn}`
    : '';

  const rows = await db.query<Record<string, unknown>>(
    `SELECT ${selectedColumns}
       FROM ${PURCH_MRP_TABLE} mrp
       ${join}
      WHERE mrp.MRPNo = @mrpNo`,
    { mrpNo },
  );

  return rows.map((row) => ({
    materialId: trimmed(row.materialId),
    materialName: nameConfigured ? trimmed(row.materialName) : MATERIAL_NAME_NOT_CONFIGURED,
    qty: numberOrZero(row.qty),
    uom: trimmed(row.uom),
    harga: numberOrZero(row.harga),
    total: numberOrZero(row.total),
  }));
}

export interface EmployeeRow {
  nip: string;
  name: string;
  departId: string | null;
}

export async function selectEmployeeByNip(db: Queryable, nip: string): Promise<EmployeeRow | null> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT TOP 1 NIP, Name, DepartID
       FROM hris_Employee
      WHERE NIP = @nip`,
    { nip },
  );
  const row = rows[0];
  if (!row) return null;
  return {
    nip: trimmed(row.NIP) || nip,
    name: trimmed(row.Name),
    departId: trimmed(row.DepartID) || null,
  };
}

export async function selectDepartmentName(db: Queryable, departId: string): Promise<string | null> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT TOP 1 NamaDepartemen
       FROM MASCOSTCENTER
      WHERE DepartID = @departId
        AND NamaDepartemen IS NOT NULL
        AND NamaDepartemen <> ''`,
    { departId },
  );
  const value = rows[0]?.NamaDepartemen;
  return value == null ? null : trimmed(value);
}

/**
 * Tahap blocking pertama yang tanggalnya masih NULL, atau null kalau sudah semua.
 * Tahap non-blocking (mis. GH, DH) dilewati supaya alur tidak mentok di tahap
 * yang realisasinya tidak pernah ada.
 */
export function nextPendingStage(states: StageState): StageCode | null {
  for (const stage of STAGES) {
    if (!stage.blocking) continue;
    if (isBlank(states[stage.code].date)) return stage.code;
  }
  return null;
}

export function isStageApproved(states: StageState, code: StageCode): boolean {
  return !isBlank(states[code].date);
}

export function stageLabelOf(code: string): string {
  return getStage(code)?.label ?? code;
}

export function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  // PURCH_MRP_NOTE.Total bertipe varchar, jadi harus diparse dari teks.
  const text = typeof value === 'string' ? value.trim() : value;
  if (text === '') return null;
  const n = typeof text === 'number' ? text : Number(String(text).replace(/[^0-9.,-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function numberOrZero(value: unknown): number {
  return numberOrNull(value) ?? 0;
}

export function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === '';
}

/**
 * Banyak kolom di PURCH_MRP bertipe nchar/char, jadi nilainya selalu-datang
 * dengan spasi di belakang ("RA4A00041      ", "PCS                 ").
 * Semua nilai teks harus di-trim sebelum ditampilkan atau dibandingkan.
 */
export function trimmed(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/** Periode dari MRPDate. Di database kolom ini varchar, isinya "2026-10". */
export function periodeFrom(mrpDate: Date | string | null): string {
  if (mrpDate == null) return '';

  if (typeof mrpDate === 'string') {
    const text = mrpDate.trim();
    if (/^\d{4}-\d{2}$/.test(text)) return text;
    if (text !== '') {
      const parsed = new Date(text);
      if (!Number.isNaN(parsed.getTime())) return formatYearMonth(parsed);
    }
    return text;
  }

  if (Number.isNaN(mrpDate.getTime())) return '';
  return formatYearMonth(mrpDate);
}

function formatYearMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Tanggal dari database dikirim dengan offset WIB supaya tidak ambigu di client. */
export function toWibIso(value: Date | string | null): string {
  if (value == null) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' }).replace(' ', 'T')}+07:00`;
}

export function toWibIsoFromMs(ms: number): string {
  return toWibIso(new Date(ms));
}