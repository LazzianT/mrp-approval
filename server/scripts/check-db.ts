/**
 * Cek koneksi ke SQL Server sekaligus membaca nama kolom yang sebenarnya.
 *
 * Dipakai sebelum menyambungkan server ke database, dan untuk mengisi
 * MRP_MATERIAL_COLUMNS yang sekarang masih placeholder.
 *
 * Jalankan:  npm run check:db -w server
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mssql from 'mssql';
import { env } from '../src/config/env.js';

const { ConnectionPool } = mssql;
type MssqlConfig = mssql.config;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const host = env.DB_HOST;
const port = env.DB_PORT;
const database = env.DB_NAME;
const user = env.DB_USER;
const password = env.DB_PASSWORD;

const poolConfig: MssqlConfig = {
  server: host,
  port,
  database,
  user,
  password,
  options: {
    encrypt: env.DB_ENCRYPT,
    trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE,
    connectTimeout: 10_000,
    requestTimeout: 15_000,
  },
};

function line(char = '-', width = 70): string {
  return char.repeat(width);
}

async function main(): Promise<void> {
  console.log(line('='));
  console.log('CEK KONEKSI SQL SERVER');
  console.log(line('='));
  console.log(`Host     : ${host}:${port}`);
  console.log(`Database : ${database}`);
  console.log(`User     : ${user ? '(diisi)' : '(KOSONG - isi DB_USER di .env)'}`);
  console.log(`Env file : ${path.join(repoRoot, '.env')} (root repo)`);

if (!user || user === 'placeholder') {
    console.log('\nGAGAL: DB_USER belum diisi.');
    console.log('Isi kredensial dari application/config/database.php (group default) di repo CodeIgniter,');
    console.log('lalu jalankan ulang perintah ini. Port 1433 ke host tujuan sudah bisa dijangkau.');
    return;
}

  const pool = new ConnectionPool(poolConfig);

  try {
    await pool.connect();
    console.log('\n[OK] Terhubung ke SQL Server.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`\nGAGAL: tidak bisa terhubung.\n  ${message}`);
    console.log('\nKemungkinan penyebab:');
    console.log('  1. Port 1433 diblokir firewall -> perlu port-forward ke server.');
    console.log('  2. SQL Server hanya mendengarkan Named Pipes / port lain.');
    console.log('  3. Kredensial atau nama database salah.');
    return;
  }

  try {
    const version = await pool.request().query<{ version: string; productLevel: string; edition: string }>(
      "SELECT @@VERSION AS version, SERVERPROPERTY('ProductLevel') AS productLevel, SERVERPROPERTY('Edition') AS edition",
    );
    const info = version.recordset[0];
    if (info) {
      console.log(`\nVersi    : ${String(info.version).split('\n')[0]}`);
      console.log(`Edition  : ${info.edition}`);
    }

    const tables = await pool.request().query<{ TABLE_SCHEMA: string; TABLE_NAME: string }>(
      `SELECT TABLE_SCHEMA, TABLE_NAME
         FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME IN ('PURCH_MRP', 'PURCH_MRP_NOTE')
        ORDER BY TABLE_NAME`,
    );

    console.log(`\n${line()}\nTABEL DITEMUKAN\n${line()}`);
    if (tables.recordset.length === 0) {
      console.log('PURCH_MRP / PURCH_MRP_NOTE tidak ditemukan di database ini.');
    }
    for (const table of tables.recordset) {
      console.log(`  ${table.TABLE_SCHEMA}.${table.TABLE_NAME}`);
    }

    const mrptables = tables.recordset.filter((t) => t.TABLE_NAME === 'PURCH_MRP');
    for (const table of mrptables) {
      const columnsRequest = pool.request();
      columnsRequest.input('schema', table.TABLE_SCHEMA);
      columnsRequest.input('table', table.TABLE_NAME);
      const columns = await columnsRequest.query<{
        ORDINAL_POSITION: number;
        COLUMN_NAME: string;
        DATA_TYPE: string;
        IS_NULLABLE: string;
      }>(
        `SELECT ORDINAL_POSITION, COLUMN_NAME, DATA_TYPE, IS_NULLABLE
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table
          ORDER BY ORDINAL_POSITION`,
      );

      console.log(`\n${line()}\nKOLOM ${table.TABLE_SCHEMA}.${table.TABLE_NAME}\n${line()}`);
      for (const column of columns.recordset) {
        console.log(
          `  ${String(column.ORDINAL_POSITION).padStart(3)}  ${column.COLUMN_NAME.padEnd(24)} ${column.DATA_TYPE} ${column.IS_NULLABLE === 'NO' ? 'NOT NULL' : ''}`,
        );
      }
      printMaterialCandidates(columns.recordset.map((c) => c.COLUMN_NAME));
    }

    const materialTables = await pool.request().query<{ TABLE_SCHEMA: string; TABLE_NAME: string; COLUMN_COUNT: number }>(
      `SELECT t.TABLE_SCHEMA, t.TABLE_NAME,
              (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS c
                WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME) AS COLUMN_COUNT
         FROM INFORMATION_SCHEMA.TABLES t
        WHERE t.TABLE_NAME LIKE '%material%'
           OR t.TABLE_NAME LIKE '%barang%'
           OR t.TABLE_NAME LIKE '%item%'
        ORDER BY t.TABLE_NAME`,
    );

    console.log(`\n${line()}\nTABEL KANDIDAT MASTER MATERIAL\n${line()}`);
    if (materialTables.recordset.length === 0) {
      console.log('Tidak ada tabel dengan pola material/barang/item.');
    }
    for (const table of materialTables.recordset) {
      console.log(`  ${table.TABLE_SCHEMA}.${table.TABLE_NAME} (${table.COLUMN_COUNT} kolom)`);
    }

    // Nama material tidak ada di PURCH_MRP, jadi harus dari tabel master.
    // Cetak kolom tabel master yang paling mungkin untuk memberitahu developer
    // kolom mana yang perlu di-join.
    for (const candidate of ['MATERIAL_NAME', 'MAS_MATERIAL', 'MATERIAL_PESAN']) {
      const found = materialTables.recordset.find((t) => t.TABLE_NAME === candidate);
      if (!found) continue;

      const masterRequest = pool.request();
      masterRequest.input('schema', found.TABLE_SCHEMA);
      masterRequest.input('table', found.TABLE_NAME);
      const masterColumns = await masterRequest.query<{ COLUMN_NAME: string; DATA_TYPE: string }>(
        `SELECT COLUMN_NAME, DATA_TYPE
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table
          ORDER BY ORDINAL_POSITION`,
      );

      console.log(`\nKOLOM ${found.TABLE_SCHEMA}.${found.TABLE_NAME}`);
      console.log(`  ${masterColumns.recordset.map((c) => `${c.COLUMN_NAME} (${c.DATA_TYPE})`).join(', ')}`);
    }

    const sample = await pool
      .request()
      .query<{ MRPNo: string }>('SELECT TOP 3 MRPNo FROM BMC.dbo.PURCH_MRP ORDER BY MRPDate DESC');

    console.log(`\n${line()}\nCONTOH NOMOR MRP\n${line()}`);
    if (sample.recordset.length === 0) {
      console.log('Tabel PURCH_MRP kosong.');
    } else {
      for (const row of sample.recordset) console.log(`  ${row.MRPNo}`);
    }
  } finally {
    await pool.close().catch(() => undefined);
  }}

const MATERIAL_HINTS: Record<string, RegExp[]> = {
  materialId: [/^MaterialID?$/i, /MatCode/i, /KodeMaterial/i],
  materialName: [/^Material(Name)?$/i, /NamaMaterial/i, /Description/i],
  qty: [/^(Qty|Quantity|Jumlah)$/i],
  uom: [/^(UoM|UOM|SATUAN|Unit)$/i],
  harga: [/^(Harga|Price|PriceAmount)$/i],
  total: [/^(Total|JumlahHarga|TotalAmount)$/i],
};

/**
 * Memberi tebakan nama kolom material berdasarkan pola umum, supaya whoever
 * mengisi MRP_MATERIAL_COLUMNS punya kandidat, bukan menebak dari nol.
 */
function printMaterialCandidates(allColumns: string[]): void {
  console.log(`\n${line()}\nKANDIDAT KOLOM MATERIAL (untuk MRP_MATERIAL_COLUMNS)\n${line()}`);

  let found = 0;
  for (const [field, patterns] of Object.entries(MATERIAL_HINTS)) {
    const matches = allColumns.filter((column) => patterns.some((p) => p.test(column)));
    if (matches.length > 0) {
      found += 1;
      console.log(`  ${field.padEnd(14)} -> ${matches.join(', ')}`);
    }
  }

  if (found === 0) {
    console.log('  Tidak ada kandidat yang cocok pola umum.');
    console.log('  Periksa daftar kolom di atas, lalu isi manual di server/src/config/mrpColumns.ts.');
  } else {
    console.log('\n  Kandidat di atas hanya tebakan pola, belum tentu benar.');
    console.log('  Pastikan dulu di aplikasi lama (getMrpDetail()) kolom mana yang dipakai.');
  }
}

main()
  .catch((error) => {
    console.error('GAGAL:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());