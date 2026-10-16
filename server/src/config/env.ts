import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// .env dibaca dari server/ lalu dari root repo, supaya satu file .env di root cukup untuk keduanya.
loadDotenv({ path: path.join(serverRoot, '.env') });
loadDotenv({ path: path.join(serverRoot, '..', '.env') });

const envSchema = z.object({
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(1433),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string().min(1),
  DB_ENCRYPT: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  DB_TRUST_SERVER_CERTIFICATE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),

  APP_URL: z.string().url(),
  /**
   * Host yang bisa dijangkau perangkat lain di jaringan (mis. HP yang memindai
   * QR). Dipakai sebagai basis URL approval kalau diisi, karena localhost tidak
   * berlaku dari HP.
   */
  PUBLIC_APP_URL: z
    .string()
    .optional()
    .transform((value) => (value && value.trim() !== '' ? value.trim() : undefined))
    .refine((value) => value === undefined || z.string().url().safeParse(value).success, {
      message: 'PUBLIC_APP_URL harus berupa URL yang valid',
    }),
  TOKEN_SECRET: z
    .string()
    .min(32, 'TOKEN_SECRET minimal 32 karakter'),
  API_KEY: z.string().min(8, 'API_KEY minimal 8 karakter'),

  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /**
   * Mode data dummy: server tidak menyentuh database sama sekali, sehingga
   * tampilan halaman bisa dirapikan tanpa koneksi SQL Server.
   * WAJIB false di production - server menolak start kalau terbalik.
   */
  DUMMY_MODE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  /**
   * Apakah server boleh menulis ulang kolom Status, Status_Info, Approval, dan
   * Approval_Info setelah approval.
   *
   * Default false dan SENGAJA begitu. Data nyata di SQL Server menunjukkan
   * kolom-kolom itu tidak memakai kode tahap:
   *   Approval     -> "1" atau "3" (angka, tipe nchar)
   *   Approval_Info-> "Req Approval Manager" (teks bebas)
   *   Status       -> 1 = "Req Approval Manager", 3 = "Informing to BOD"
   * Menulis "GH" atau "Group Head" ke sana akan merusak tampilan listmrp.
   *
   * TODO: konfirmasi ke tim - nyalakan hanya setelah aturan status dari
   * update_approvalmrp() di aplikasi lama dikonfirmasi.
   */
  WRITE_STATUS_SUMMARY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const detail = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  throw new Error(`Konfigurasi environment tidak valid:\n${detail}\n\nSalin .env.example menjadi .env lalu isi.`);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';

if (isProduction && !env.APP_URL.startsWith('https://')) {
  throw new Error('APP_URL wajib memakai https:// pada NODE_ENV=production.');
}

if (isProduction && env.DUMMY_MODE) {
  throw new Error('DUMMY_MODE wajib false pada NODE_ENV=production.');
}