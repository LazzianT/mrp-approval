import mssql from 'mssql';
import { env } from '../src/config/env.js';

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
  requestTimeout: 30000,
};

const pool = new ConnectionPool(poolConfig);

async function main(): Promise<void> {
  await pool.connect();

  const counts = await pool.request().query(`
    SELECT
      (SELECT COUNT(*) FROM BMC.dbo.PURCH_MRP)      AS total_mrp,
      (SELECT COUNT(*) FROM BMC.dbo.PURCH_MRP_NOTE) AS total_note,
      (SELECT COUNT(*) FROM dbo.MATERIAL_NAME)      AS total_material_name`);

  console.log('JUMLAH BARIS:', counts.recordset[0]);

  // Berapa MRP yang benar-benar menunggu approval tahap 1?
  const waiting = await pool.request().query(`
    SELECT TOP 5 MRPNo, Requestor, MRPDate, Status, Status_Info, Approval, Approval_Info,
           ApprovalMgr_By, ApprovalMgr_Date, TotalHargaApproved
      FROM BMC.dbo.PURCH_MRP
     WHERE ApprovalMgr_Date IS NULL
     ORDER BY Id DESC`);

  console.log(`\nMENUNGGU TAHAP 1 (ApprovalMgr_Date IS NULL): ${waiting.recordset.length} contoh`);
  for (const row of waiting.recordset) console.log(' ', JSON.stringify(row));

  // Cek apakah tahap tambahan ikut terisi pada MRP yang sama.
  const stages = await pool.request().query(`
    SELECT TOP 3
      MRPNo,
      CASE WHEN ApprovalMgr_Date     IS NOT NULL THEN 'Mgr' ELSE '-' END AS Mgr,
      CASE WHEN Approval_ghDate      IS NOT NULL THEN 'gh' ELSE '-' END AS Gh,
      CASE WHEN Approval_dhDate      IS NOT NULL THEN 'dh' ELSE '-' END AS Dh,
      CASE WHEN ApprovalIc_Date      IS NOT NULL THEN 'Ic' ELSE '-' END AS Ic,
      CASE WHEN ApprovalProc_Date    IS NOT NULL THEN 'Proc' ELSE '-' END AS Procurement,
      CASE WHEN ApprovalGhFa_Date    IS NOT NULL THEN 'GhFa' ELSE '-' END AS GhFa,
      CASE WHEN ApprovalCfo_Date     IS NOT NULL THEN 'Cfo' ELSE '-' END AS Cfo,
      CASE WHEN ApprovalDirektur_Date IS NOT NULL THEN 'Direktur' ELSE '-' END AS Direktur,
      CASE WHEN ApprovalPresdir_Date  IS NOT NULL THEN 'Presdir' ELSE '-' END AS Presdir,
      CASE WHEN Approval_shDate      IS NOT NULL THEN 'sh' ELSE '-' END AS ShLegacy,
      Status, Status_Info, Approval, Approval_Info
    FROM BMC.dbo.PURCH_MRP
    WHERE ApprovalMgr_Date IS NOT NULL
    ORDER BY Id DESC`);

  console.log(`\nTAHAP YANG TERISI PADA MRP SUDAH DIPROSES: ${stages.recordset.length} contoh`);
  for (const row of stages.recordset) console.log(' ', JSON.stringify(row));

  // Contoh baris material untuk MRP yang masih menunggu approval.
  const lastMrp = waiting.recordset[0] as { MRPNo: string } | undefined;
  if (lastMrp) {
    const materialRequest = pool.request();
    materialRequest.input('mrpNo', lastMrp.MRPNo);
    const materials = await materialRequest.query(
      `SELECT TOP 5 MaterialId, Qty, UoM, Harga, Total_Harga
         FROM BMC.dbo.PURCH_MRP
        WHERE MRPNo = @mrpNo`,
    );
    console.log(`\nCONTOH MATERIAL UNTUK ${lastMrp.MRPNo}: ${materials.recordset.length} baris`);
    for (const row of materials.recordset) console.log(' ', JSON.stringify(row));
  }

  const note = await pool.request().query(
    `SELECT TOP 3 * FROM BMC.dbo.PURCH_MRP_NOTE ORDER BY 1 DESC`,
  );
  console.log(`\nCONTOH PURCH_MRP_NOTE: ${note.recordset.length} baris`);
  if (note.recordset[0]) console.log(' ', JSON.stringify(note.recordset[0]));

  await pool.close();
}

main().catch((error) => {
  console.error('GAGAL:', error instanceof Error ? error.message : error);
  process.exit(1);
});
