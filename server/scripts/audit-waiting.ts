import mssql from 'mssql';
import { env } from '../src/config/env.js';

/**
 * MRP mana yang masih menunggu tahap SH (menurut aturan terbaru:
 * dianggap sudah approve kalau Approval_shDate ATAU ApprovalMgr_Date terisi).
 * READ-ONLY. Jalankan: npm run audit:waiting -w server
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
  console.log('MRP YANG MASIH MENUNGGU TAHAP SH (READ-ONLY)\n');

  const rows = await pool.request().query(`
    SELECT TOP 12 MRPNo, MRPDate, Requestor, Jenis, Tipe, DepartId, Status, Status_Info,
           Approval_shName, Approval_shDate, ApprovalMgr_By, ApprovalMgr_Date
      FROM BMC.dbo.PURCH_MRP
     WHERE Approval_shDate IS NULL
       AND ApprovalMgr_Date IS NULL
       AND Status <> 2
       AND Tipe LIKE '%BP%'
     ORDER BY Id DESC`);

  console.log("  (difilter Tipe LIKE '%BP%' - hanya ini yang tampil di listmrp)\n");
  console.log('  MRPNo             periode   req    sh      mgr     status  info');
  for (const r of rows.recordset) {
    const cols = [
      String(r.MRPNo ?? '').padEnd(18),
      String(r.MRPDate ?? '').padEnd(10),
      String(r.Requestor ?? '').padEnd(7),
      String(r.Approval_shName ?? '-').padEnd(8),
      String((r.ApprovalMgr_By ?? '-').trim()).padEnd(8),
      String(r.Status ?? '').padEnd(7),
      String(r.Status_Info ?? ''),
    ];
    console.log(`  ${cols.join('')}`);
  }

  console.log(`\n  total: ${rows.recordset.length} baris ditampilkan`);

  await pool.close();
}

main().catch((error) => {
  console.error('GAGAL:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});