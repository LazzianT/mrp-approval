import crypto from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Enkripsi nomor MRP untuk ditaruh di URL.
 *
 * Dipakai SEMENTARA (QA) supaya tautan approval tidak menampilkan nomor MRP
 * polos (?mrpNo=BP.08.08.26.002). Format parameter: ?m=<base64url(iv|tag|cipher)>
 *
 * PENTING: enkripsi ini menyamar, bukan otorisasi. Siapa pun yang punya
 * tautan tetap bisa membukanya. Untuk production, ganti dengan signed token
 * plus verifikasi identitas (lihat services/token.ts).
 *
 * Kompatibilitas wajib dengan sisi PHP (CodeIgniter) di mrp_approval_link():
 *   key  = sha256(secret) sebagai 32 byte mentah
 *   iv   = 12 byte acak
 *   tag  = 16 byte (panjang default GCM)
 *   data = iv . tag . ciphertext, lalu base64url tanpa padding
 */

const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const ALGORITHM = 'aes-256-gcm';

function key(): Buffer {
  // TOKEN_SECRET minimal 32 karakter, tapi di-hash supaya panjangnya pasti 32 byte.
  return crypto.createHash('sha256').update(env.TOKEN_SECRET, 'utf8').digest();
}

function base64url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function encryptMrpNo(mrpNo: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(mrpNo, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return base64url(Buffer.concat([iv, tag, ciphertext]));
}

/**
 * Balikkan payload ke nomor MRP.
 * Return null kalau payload rusak, bukan base64, atau gagal diverifikasi -
 * semua kasus itu berarti tautannya tidak bisa dipercaya.
 */
export function decryptMrpNo(payload: string): string | null {
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const buffer = Buffer.from(normalized, 'base64');

    if (buffer.length <= IV_LENGTH + TAG_LENGTH) return null;

    const iv = buffer.subarray(0, IV_LENGTH);
    const tag = buffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = buffer.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key(), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    return plain.toString('utf8').trim() || null;
  } catch {
    return null;
  }
}