/**
 * Membuat token approval untuk pengujian manual.
 *
 * Jalankan tanpa server yang hidup, cukup dengan .env yang benar:
 *   npm run token -w server -- "MRP/2026/10/001" SH
 *   npm run token -w server -- "MRP/2026/10/001" SH 5678 --expired
 */
import 'dotenv/config';
import { env } from '../src/config/env.js';
import { isStageCode, STAGES, type StageCode } from '../src/config/stages.js';
import { generateToken, tokenForLog, verifyToken } from '../src/services/token.js';

const args = process.argv.slice(2);
const mrpNo = args[0];

if (!mrpNo) {
  console.error('Usage: npm run token -w server -- <MRPNo> [tahap] [approverNip] [--expired]');
  console.error(`Tahap yang tersedia: ${STAGES.map((s) => `${s.code} (${s.label})`).join(', ')}`);
  process.exit(1);
}

const tahap = ((args[1] as string | undefined) ?? 'SH').toUpperCase();
if (!isStageCode(tahap)) {
  console.error(`Tahap "${tahap}" tidak dikenal. Pilihan: ${STAGES.map((s) => s.code).join(', ')}`);
  process.exit(1);
}

const approverNip = args[2] && !args[2].startsWith('--') ? args[2] : undefined;
const forceExpired = args.includes('--expired');

const ttlMs = forceExpired ? -60_000 : undefined;
const { token, exp } = generateToken(
  mrpNo,
  tahap as StageCode,
  env.TOKEN_SECRET,
  ttlMs,
  Date.now(),
  approverNip,
);

const url = `${(env.PUBLIC_APP_URL ?? env.APP_URL).replace(/\/+$/, '')}/approve?token=${encodeURIComponent(token)}`;

console.log('Token   :', token);
console.log('Log-safe:', tokenForLog(token));
console.log('Berlaku :', new Date(exp).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }));
console.log('URL     :', url);

try {
  const verified = verifyToken(token, env.TOKEN_SECRET);
  console.log('Verifikasi:', forceExpired ? 'ditolak (expired, sesuai yang diminta)' : `OK -> ${verified.mrpNo} / ${verified.tahap}`);
} catch (error) {
  console.log('Verifikasi:', error instanceof Error ? error.message : error);
}