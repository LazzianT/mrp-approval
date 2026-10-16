/**
 * Pemetaan nama kolom nyata di BMC.dbo.PURCH_MRP -> field DTO.
 *
 * Kolom header sudah dikonfirmasi dari spesifikasi dan boleh dipakai langsung.
 * Kolom baris material sudah diverifikasi ke SQL Server (SQL Server 2019,
 * 39.279 baris) pada 2026-10-16 lewat `npm run check:db -w server`.
 */

export const MRP_HEADER_COLUMNS = {
  mrpNo: 'MRPNo',
  mrpDate: 'MRPDate',
  jenis: 'Jenis',
  requestor: 'Requestor',
  keperluan: 'Keperluan',
  departId: 'DepartId',
  tipe: 'Tipe',
  status: 'Status',
  statusInfo: 'Status_Info',
  approval: 'Approval',
  approvalInfo: 'Approval_Info',
  totalHargaApproved: 'TotalHargaApproved',
} as const;

export const MRP_NOTE_COLUMNS = {
  total: 'Total',
  note: 'Note',
  departId: 'DepartID',
} as const;

/**
 * Nama kolom baris material di BMC.dbo.PURCH_MRP.
 *
 * CATATAN: PURCH_MRP tidak punya kolom nama material. Yang tersedia hanya
 * MaterialId, Qty, UoM, Harga, dan Total_Harga. Nama material diambil dari
 * tabel master lewat join, lihat MRP_MATERIAL_NAME_SOURCE.
 */
export const MRP_MATERIAL_COLUMNS = {
  materialId: 'MaterialId',
  qty: 'Qty',
  uom: 'UoM',
  harga: 'Harga',
  total: 'Total_Harga',
} as const;

/**
 * Nama material TIDAK ada di PURCH_MRP, jadi diambil dari tabel master lewat join.
 *
 * Sudah dikonfirmasi dari aplikasi CodeIgniter yang berjalan (getMrpDetail(),
 * application/controllers/online_pr.php):
 *   FROM BMC.dbo.PURCH_MRP a
 *   LEFT JOIN BMC.dbo.PURC_MATCATALOG c ON c.Materialid = a.MaterialId
 *   SELECT ... c.MaterialName ...
 */
export const MRP_MATERIAL_NAME_SOURCE = {
  table: 'BMC.dbo.PURC_MATCATALOG',
  alias: 'cat',
  /** diekstrak ke SQL dengan prefix mrp. */
  joinOn: 'cat.Materialid = mrp.MaterialId',
  column: 'MaterialName',
} as const;

/**
 * Kolom-kolom ini menyimpan angka urut tahap dan teks bebas, BUKAN kode tahap.
 * Contoh nyata dari database: Approval = "1", Approval_Info = "Req Approval Manager".
 */
export const MRP_STATUS_SUMMARY_COLUMNS = ['Status', 'Status_Info', 'Approval', 'Approval_Info'] as const;

export function materialColumnsArePlaceholder(): boolean {
  return !MRP_MATERIAL_NAME_SOURCE.column;
}

let warned = false;

/** Memberi tahu sekali saat server start bahwa sumber nama material belum diisi. */
export function warnIfMaterialColumnsUnset(): void {
  if (!materialColumnsArePlaceholder() || warned) return;
  warned = true;
  console.warn(
    '[mrp-approval] PERINGATAN: sumber nama material di server/src/config/mrpColumns.ts belum diisi. ' +
      'PURCH_MRP tidak punya kolom nama material, jadi MRP_MATERIAL_NAME_SOURCE harus menunjuk ' +
      'tabel master + cara join-nya. Selama belum diisi, kolom Nama Material kosong.',
  );
}

export function assertMaterialColumnsSet(): void {
  if (materialColumnsArePlaceholder()) {
    throw new Error(
      'Sumber nama material belum dikonfigurasi. Isi MRP_MATERIAL_NAME_SOURCE di server/src/config/mrpColumns.ts.',
    );
  }
}