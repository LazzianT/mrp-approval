import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { isStageCode, type StageCode } from '../config/stages.js';
import type { TokenPayload } from '../types.js';

export const TOKEN_TTL_MS = 72 * 60 * 60 * 1000;

const payloadSchema = z.object({
  mrpNo: z.string().min(1),
  tahap: z.string().refine(isStageCode, { message: 'Tahap approval tidak dikenal' }),
  exp: z.number().int().positive(),
  nonce: z.string().regex(/^[0-9a-f]{32}$/, 'nonce harus hex 16 byte'),
  approverNip: z.string().min(1).optional(),
});

export type VerifyFailure = 'invalid' | 'expired';

export class TokenError extends Error {
  readonly reason: VerifyFailure;
  constructor(reason: VerifyFailure, message: string) {
    super(message);
    this.name = 'TokenError';
    this.reason = reason;
  }
}

export function base64urlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64urlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64');
}

function sign(payloadB64: string, secret: string): string {
  return base64urlEncode(createHmac('sha256', secret).update(payloadB64).digest());
}

export function createToken(
  payload: { mrpNo: string; tahap: StageCode; exp: number; nonce: string; approverNip?: string },
  secret: string,
): string {
  const normalized = payloadSchema.parse({
    mrpNo: payload.mrpNo,
    tahap: payload.tahap.toUpperCase(),
    exp: payload.exp,
    nonce: payload.nonce,
    ...(payload.approverNip ? { approverNip: payload.approverNip } : {}),
  });
  const payloadB64 = base64urlEncode(JSON.stringify(normalized));
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

export function isExpired(payload: TokenPayload, now: number = Date.now()): boolean {
  return payload.exp <= now;
}

/**
 * Verifikasi tanda tangan lalu validasi isi.
 * Urutan: tanda tangan dulu (supaya payload dari penyerang tidak dipercaya),
 * baru cek expired.
 */
export function verifyToken(token: string, secret: string, now: number = Date.now()): TokenPayload {
  if (typeof token !== 'string' || token.length === 0 || token.length > 4096) {
    throw new TokenError('invalid', 'Token tidak valid.');
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new TokenError('invalid', 'Format token tidak valid.');
  }

  const [payloadB64, signatureB64] = parts as [string, string];
  if (!payloadB64 || !signatureB64) {
    throw new TokenError('invalid', 'Format token tidak valid.');
  }

  const expected = Buffer.from(sign(payloadB64, secret), 'utf8');
  const actual = Buffer.from(signatureB64, 'utf8');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new TokenError('invalid', 'Token tidak valid.');
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(base64urlDecode(payloadB64).toString('utf8'));
  } catch {
    throw new TokenError('invalid', 'Isi token tidak dapat dibaca.');
  }

  const result = payloadSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new TokenError('invalid', 'Isi token tidak sesuai.');
  }

  const payload = result.data as TokenPayload;
  if (isExpired(payload, now)) {
    throw new TokenError('expired', 'Tautan approval sudah tidak berlaku.');
  }

  return payload;
}

/** Hanya 8 karakter pertama token yang boleh masuk log. */
export function tokenForLog(token: string | undefined | null): string {
  if (!token) return '(kosong)';
  return `${token.slice(0, 8)}...`;
}

export function generateNonce(): string {
  return randomBytes(16).toString('hex');
}

export function generateToken(
  mrpNo: string,
  tahap: StageCode,
  secret: string,
  ttlMs: number = TOKEN_TTL_MS,
  now: number = Date.now(),
  approverNip?: string,
): TokenPayload & { token: string } {
  const payload = {
    mrpNo,
    tahap,
    exp: now + ttlMs,
    nonce: generateNonce(),
    ...(approverNip ? { approverNip } : {}),
  };
  return { ...payload, token: createToken(payload, secret) };
}