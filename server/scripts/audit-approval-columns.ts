import mssql from 'mssql';
import { env } from '../src/config/env.js';

/**
 * Audit kolom approval di BMC.dbo.PURCH_MRP.
 * READ-ONLY: hanya SELECT, tidak menulis apa pun ke database.
 *
 * Jalankan: npm run audit -w server
 */

const { ConnectionPool } = mssql;

const poolConfig: mssql.config = {
  server: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  options: {
    encrypt: env.DB_ENCRYPT,
    trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE,
  },
  connectionTimeout: 15000,
  requestTimeout: 60000,
};

const pool = new ConnectionPool(poolConfig);

const CANDIDATES = [
  'Approval',
  'Approval_By',
  'Approval_Date',
  'ApprovalMgr',
  'ApprovalMgr_By',
  'ApprovalMgr_Date',
  'Approval_shName',
  'Approval_shDate',
  'Approval_ghName',
  'Approval_ghDate',
  'Approval_dhName',
  'Approval_dhDate',
  'ApprovalIc',
  'ApprovalIc_By',
  'ApprovalIc_Date',
  'ApprovalProc',
  'ApprovalProc_By',
  'ApprovalProc_Date',
  'ApprovalGhFa',
  'ApprovalGhFa_By',
  'ApprovalGhFa_Date',
  'ApprovalCfo',
  'ApprovalCfo_By',
  'ApprovalCfo_Date',
  'ApprovalDirektur_By',
  'ApprovalDirektur_Date',
  'ApprovalPresdir_By',
  'ApprovalPresdir_Date',
  'Status',
  'Status_Info',
  'Status_By',
  'Status_Date',
  'TotalHargaApproved',
];

function pad(value: unknown, width: number): string {
  const text = value === null || value === undefined ? '' : String(value);
  return text.length >= width ? text.slice(0, width) : text + ' '.repeat(width - text.length);
}

async function main(): Promise<void> {
  await pool.connect();
  console.log('AUDIT KOLOM APPROVAL - BMC.dbo.PURCH_MRP (READ-ONLY)\n');

  // 1. Kolom mana yang benar-benar ada di tabel
  const existing = await pool.request().query(`
    SELECT c.name AS name, t.name AS typeName, c.max_length AS maxLength
      FROM sys.columns c
      JOIN sys.types t ON c.user_type_id = t.user_type_id
     WHERE c.object_id = OBJECT_ID('BMC.dbo.PURCH_MRP')`);

  const existingMap = new Map(
    existing.recordset.map((r: Record<string, unknown>) => [String(r.name), r]),
  );

  console.log('1. KOLOM YANG ADA');
  for (const name of CANDIDATES) {
    const col = existingMap.get(name);
    console.log(
      `  ${col ? 'ADA ' : 'TIDAK ADA'}  ${pad(name, 24)} ${
        col ? `${String(col.typeName)}(${col.maxLength})` : ''
      }`,
    );
  }

  // 2. Berapa baris yang terisi per kolom
  const parts = CANDIDATES.filter((n) => existingMap.has(n)).map(
    (n) =>
      `SUM(CASE WHEN [${n}] IS NOT NULL AND LTRIM(RTRIM(CAST([${n}] AS nvarchar(200)))) <> '' THEN 1 ELSE 0 END) AS [${n}]`,
  );

  const filled = await pool.request().query(
    `SELECT COUNT(*) AS totalRows, ${parts.join(', ')} FROM BMC.dbo.PURCH_MRP`,
  );
  const total = Number(filled.recordset[0].totalRows);

  console.log(`\n2. JUMLAH BARIS TERISI (total baris = ${total})`);
  console.log(`  ${pad('KOLOM', 24)} ${pad('TERISI', 10)} PERSEN`);
  for (const name of CANDIDATES) {
    if (!existingMap.has(name)) continue;
    const count = Number(filled.recordset[0][name] ?? 0);
    const pct = total > 0 ? ((count / total) * 100).toFixed(2) : '0.00';
    console.log(`  ${pad(name, 24)} ${pad(count, 10)} ${pct}%`);
  }

  // 3. Konflik: SH legacy vs ApprovalMgr
  const conflict = await pool.request().query(`
    SELECT
      SUM(CASE WHEN Approval_shName IS NOT NULL AND LTRIM(RTRIM(Approval_shName)) <> '' THEN 1 ELSE 0 END) AS shLegacy,
      SUM(CASE WHEN ApprovalMgr_By    IS NOT NULL AND LTRIM(RTRIM(ApprovalMgr_By))    <> '' THEN 1 ELSE 0 END) AS mgrBy,
      SUM(CASE WHEN Approval_shDate IS NOT NULL THEN 1 ELSE 0 END) AS shDate,
      SUM(CASE WHEN ApprovalMgr_Date IS NOT NULL THEN 1 ELSE 0 END) AS mgrDate
    FROM BMC.dbo.PURCH_MRP`);

  console.log('\n3. KONFLIK TAHAP 1 (SH)');
  console.log(`  Approval_shName terisi   : ${conflict.recordset[0].shLegacy}`);
  console.log(`  ApprovalMgr_By  terisi   : ${conflict.recordset[0].mgrBy}`);
  console.log(`  Approval_shDate terisi   : ${conflict.recordset[0].shDate}`);
  console.log(`  ApprovalMgr_Date terisi  : ${conflict.recordset[0].mgrDate}`);

  // 4. Contoh nilai kolom SH legacy
  const samples = await pool.request().query(`
    SELECT TOP 8 MRPNo, Approval_shName, Approval_shDate, ApprovalMgr_By, ApprovalMgr_Date,
           Status, Status_Info
      FROM BMC.dbo.PURCH_MRP
     WHERE (Approval_shName IS NOT NULL AND LTRIM(RTRIM(Approval_shName)) <> '')
        OR (Approval_shDate IS NOT NULL)
     ORDER BY Id DESC`);

  console.log('\n4. CONTOH BARIS YANG PUNYA SH LEGACY');
  if (samples.recordset.length === 0) {
    console.log('  (tidak ada)');
  } else {
    for (const r of samples.recordset) {
      console.log(
        `  ${pad(r.MRPNo, 20)} sh=${pad(JSON.stringify(r.Approval_shName), 12)} shDate=${pad(
          r.Approval_shDate,
          12,
        )} mgrBy=${pad(JSON.stringify(r.ApprovalMgr_By), 12)} mgrDate=${pad(r.ApprovalMgr_Date, 20)}`,
      );
    }
  }

  // 5. Distribusi Status / Approval
  const status = await pool.request().query(`
    SELECT TOP 15 Status, Status_Info, COUNT(*) AS jumlah
      FROM BMC.dbo.PURCH_MRP
     GROUP BY Status, Status_Info
     ORDER BY jumlah DESC`);

  console.log('\n5. DISTRIBUSI Status / Status_Info');
  for (const r of status.recordset) {
    console.log(`  ${pad(r.Status, 10)} ${pad(r.jumlah, 8)} ${r.Status_Info ?? ''}`);
  }

  // 6. Pola tahap yang terisi bersamaan (urutan approval nyata)
  const combos = await pool.request().query(`
    SELECT TOP 10
      CASE WHEN ApprovalMgr_Date    IS NOT NULL THEN 1 ELSE 0 END AS mgr,
      CASE WHEN Approval_shDate     IS NOT NULL THEN 1 ELSE 0 END AS sh,
      CASE WHEN Approval_ghDate     IS NOT NULL THEN 1 ELSE 0 END AS gh,
      CASE WHEN Approval_dhDate     IS NOT NULL THEN 1 ELSE 0 END AS dh,
      CASE WHEN ApprovalIc_Date     IS NOT NULL THEN 1 ELSE 0 END AS ic,
      CASE WHEN ApprovalProc_Date   IS NOT NULL THEN 1 ELSE 0 END AS proc_,
      CASE WHEN ApprovalGhFa_Date   IS NOT NULL THEN 1 ELSE 0 END AS ghfa,
      CASE WHEN ApprovalCfo_Date    IS NOT NULL THEN 1 ELSE 0 END AS cfo,
      COUNT(*) AS jumlah
    FROM BMC.dbo.PURCH_MRP
    GROUP BY
      CASE WHEN ApprovalMgr_Date    IS NOT NULL THEN 1 ELSE 0 END,
      CASE WHEN Approval_shDate     IS NOT NULL THEN 1 ELSE 0 END,
      CASE WHEN Approval_ghDate     IS NOT NULL THEN 1 ELSE 0 END,
      CASE WHEN Approval_dhDate     IS NOT NULL THEN 1 ELSE 0 END,
      CASE WHEN ApprovalIc_Date     IS NOT NULL THEN 1 ELSE 0 END,
      CASE WHEN ApprovalProc_Date   IS NOT NULL THEN 1 ELSE 0 END,
      CASE WHEN ApprovalGhFa_Date   IS NOT NULL THEN 1 ELSE 0 END,
      CASE WHEN ApprovalCfo_Date    IS NOT NULL THEN 1 ELSE 0 END
    ORDER BY jumlah DESC`);

  console.log('\n6. POLA TAHAP TERISI (mgr, sh, gh, dh, ic, proc, ghfa, cfo) -> jumlah');
  for (const r of combos.recordset) {
    const pattern = [r.mgr, r.sh, r.gh, r.dh, r.ic, r.proc_, r.ghfa, r.cfo]
      .map((v) => String(v))
      .join('');
    console.log(`  ${pad(pattern, 12)} ${r.jumlah}`);
  }

  await pool.close();
}

main().catch((error) => {
  console.error('AUDIT GAGAL:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});