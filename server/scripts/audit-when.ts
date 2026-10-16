import mssql from 'mssql';
import { env } from '../src/config/env.js';

/**
 * Kapan kolom GH / DH / SH-legacy mulai terisi?
 * READ-ONLY: hanya SELECT.
 * Jalankan: npm run audit:when -w server
 */

const { ConnectionPool } = mssql;

const pool = new ConnectionPool({
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
});

async function main(): Promise<void> {
  await pool.connect();
  console.log('KAPAN KOLOM BARU MULAI TERISI? (READ-ONLY)\n');

  const periods = await pool.request().query(`
    SELECT
      MIN(Approval_shDate) AS shMin,   MAX(Approval_shDate) AS shMax,   COUNT(Approval_shDate) AS shTotal,
      MIN(Approval_ghDate) AS ghMin,   MAX(Approval_ghDate) AS ghMax,   COUNT(Approval_ghDate) AS ghTotal,
      MIN(Approval_dhDate) AS dhMin,   MAX(Approval_dhDate) AS dhMax,   COUNT(Approval_dhDate) AS dhTotal,
      MIN(ApprovalMgr_Date) AS mgrMin, MAX(ApprovalMgr_Date) AS mgrMax, COUNT(ApprovalMgr_Date) AS mgrTotal
    FROM BMC.dbo.PURCH_MRP
    WHERE Approval_shDate IS NOT NULL OR Approval_ghDate IS NOT NULL OR Approval_dhDate IS NOT NULL`);

  console.log('1. RENTANG TANGGAL KOLOM BARU');
  console.log('  ', periods.recordset[0]);

  const byMonth = await pool.request().query(`
    SELECT MRPDate,
           COUNT(*) AS total,
           SUM(CASE WHEN Approval_shDate IS NOT NULL THEN 1 ELSE 0 END) AS sh,
           SUM(CASE WHEN Approval_ghDate IS NOT NULL THEN 1 ELSE 0 END) AS gh,
           SUM(CASE WHEN Approval_dhDate IS NOT NULL THEN 1 ELSE 0 END) AS dh,
           SUM(CASE WHEN ApprovalMgr_Date IS NOT NULL THEN 1 ELSE 0 END) AS mgr,
           SUM(CASE WHEN ApprovalIc_Date   IS NOT NULL THEN 1 ELSE 0 END) AS ic
      FROM BMC.dbo.PURCH_MRP
     WHERE MRPDate IS NOT NULL AND MRPDate <> ''
     GROUP BY MRPDate
     ORDER BY MRPDate DESC`);

  console.log('\n2. JUMLAH PENGISIAN PER PERIODE MRP (10 periode terbaru)');
  console.log('  periode     total     sh    gh    dh   mgr    ic');
  for (const r of byMonth.recordset.slice(0, 10)) {
    const cols = [r.MRPDate, r.total, r.sh, r.gh, r.dh, r.mgr, r.ic].map((v) =>
      String(v ?? '').padStart(7),
    );
    console.log(`  ${cols.join(' ')}`);
  }

  const recent = await pool.request().query(`
    SELECT TOP 10 MRPNo, MRPDate, Requestor, Status, Status_Info,
           Approval_shName, Approval_shDate, Approval_ghName, Approval_ghDate,
           Approval_dhName, Approval_dhDate, ApprovalMgr_By, ApprovalMgr_Date
      FROM BMC.dbo.PURCH_MRP
     WHERE Approval_ghDate IS NOT NULL OR Approval_dhDate IS NOT NULL
     ORDER BY Id DESC`);

  console.log('\n3. BARIS YANG SUDAH PUNYA GH ATAU DH');
  if (recent.recordset.length === 0) {
    console.log('  (tidak ada sama sekali)');
  } else {
    for (const r of recent.recordset) {
      console.log(
        `  ${r.MRPNo} ${r.MRPDate} sh=${r.Approval_shName ?? '-'} gh=${r.Approval_ghName ?? '-'} dh=${r.Approval_dhName ?? '-'} mgr=${(r.ApprovalMgr_By ?? '-').trim()}`,
      );
    }
  }

  await pool.close();
}

main().catch((error) => {
  console.error('GAGAL:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});