import { describe, expect, it } from 'vitest';
import {
  TOKEN_TTL_MS,
  TokenError,
  base64urlDecode,
  base64urlEncode,
  createToken,
  generateToken,
  isExpired,
  tokenForLog,
  verifyToken,
} from '../src/services/token.js';

const SECRET = 'secret-uji-yang-cukup-panjang-minimal-32';
const OTHER_SECRET = 'secret-uji-yang-berbeda-panjang-minimal-32';
const M = 'MRP/2026/10/001';

describe('base64url', () => {
  it('tidak menghasilkan karakter +, /, atau padding =', () => {
    const encoded = base64urlEncode(Buffer.from([251, 255, 190, 239]));
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('boltol-balik dengan benar, termasuk karakter non-ASCII', () => {
    const original = Buffer.from('MRP/2026/10/001 — Budget Plan 125jt', 'utf8');
    expect(base64urlDecode(base64urlEncode(original)).equals(original)).toBe(true);
  });
});

describe('createToken / verifyToken', () => {
  it('token yang baru dibuat langsung terverifikasi', () => {
    const { token, ...payload } = generateToken(M, 'SH', SECRET);
    const verified = verifyToken(token, SECRET);
    expect(verified).toEqual(payload);
  });

  it('isi token terbaca apa adanya (mrpNo, tahap, nonce, exp)', () => {
    const now = 1_700_000_000_000;
    const { token } = generateToken(M, 'GH', SECRET, TOKEN_TTL_MS, now);
    const [payloadB64] = token.split('.') as [string, string];
    const decoded = JSON.parse(base64urlDecode(payloadB64).toString('utf8'));
    expect(decoded.mrpNo).toBe(M);
    expect(decoded.tahap).toBe('GH');
    expect(decoded.exp).toBe(now + TOKEN_TTL_MS);
    expect(decoded.nonce).toMatch(/^[0-9a-f]{32}$/);
  });

  it('berlaku 72 jam', () => {
    expect(TOKEN_TTL_MS).toBe(72 * 60 * 60 * 1000);
  });

  it('nonce berbeda tiap token dibuat', () => {
    const a = generateToken(M, 'SH', SECRET);
    const b = generateToken(M, 'SH', SECRET);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.token).not.toBe(b.token);
  });
});

describe('token yang sudah dimanipulasi ditolak', () => {
  it('satu karakter pada payload berubah -> invalid', () => {
    const { token } = generateToken(M, 'SH', SECRET);
    const [payloadB64, signature] = token.split('.') as [string, string];
    const mutated = payloadB64.slice(0, -1) + (payloadB64.endsWith('A') ? 'B' : 'A');
    expect(() => verifyToken(`${mutated}.${signature}`, SECRET)).toThrow(TokenError);
  });

  it('satu karakter pada signature berubah -> invalid', () => {
    const { token } = generateToken(M, 'SH', SECRET);
    const [payloadB64, signature] = token.split('.') as [string, string];
    const mutated = signature.slice(0, -1) + (signature.endsWith('A') ? 'B' : 'A');
    expect(() => verifyToken(`${payloadB64}.${mutated}`, SECRET)).toThrow(TokenError);
  });

  it('ditandatangani dengan secret lain -> invalid', () => {
    const { token } = generateToken(M, 'SH', OTHER_SECRET);
    expect(() => verifyToken(token, SECRET)).toThrow(/tidak valid/i);
  });

  it('payload crafted sendiri (tanpa tanda tangan) -> invalid', () => {
    const forged = base64urlEncode(JSON.stringify({ mrpNo: M, tahap: 'SH', exp: Date.now() + 1000, nonce: '0'.repeat(32) }));
    expect(() => verifyToken(forged, SECRET)).toThrow(/tidak valid/i);
  });

  it('mrpNo dicoba diubah tapi ditandatangani ulang dengan secret yang salah -> invalid', () => {
    const now = Date.now();
    const payload = { mrpNo: 'MRP/2026/10/999', tahap: 'SH' as const, exp: now + 1000, nonce: 'a'.repeat(32) };
    const token = createToken(payload, OTHER_SECRET);
    expect(() => verifyToken(token, SECRET)).toThrow(/tidak valid/i);
  });

  it('format salah -> invalid', () => {
    for (const bad of ['', 'abc', 'a.b.c', '..', 'x']) {
      expect(() => verifyToken(bad, SECRET)).toThrow(TokenError);
    }
  });

  it('nonce di luar format hex -> invalid', () => {
    const token = `${base64urlEncode(JSON.stringify({ mrpNo: M, tahap: 'SH', exp: Date.now() + 1000, nonce: 'zz' }))}.${base64urlEncode('sig')}`;
    expect(() => verifyToken(token, SECRET)).toThrow(TokenError);
  });
});

describe('expired', () => {
  it('isExpired menandai waktu lewat sebagai expired', () => {
    const payload = { mrpNo: M, tahap: 'SH' as const, exp: 1000, nonce: 'a'.repeat(32) };
    expect(isExpired(payload, 1001)).toBe(true);
    expect(isExpired(payload, 999)).toBe(false);
    expect(isExpired(payload, 1000)).toBe(true);
  });

  it('verifyToken melempar reason expired setelah 72 jam', () => {
    const now = Date.now();
    const { token } = generateToken(M, 'SH', SECRET, TOKEN_TTL_MS, now - TOKEN_TTL_MS - 1000);
    try {
      verifyToken(token, SECRET);
      expect.unreachable('verifyToken harus melempar untuk token kedaluwarsa');
    } catch (error) {
      expect(error).toBeInstanceOf(TokenError);
      expect((error as TokenError).reason).toBe('expired');
    }
  });

  it('token tepat sebelum 72 jam masih valid', () => {
    const now = Date.now();
    const { token } = generateToken(M, 'SH', SECRET, TOKEN_TTL_MS, now);
    expect(() => verifyToken(token, SECRET, now + TOKEN_TTL_MS - 1000)).not.toThrow();
  });
});

describe('kehati-hatian token', () => {
  it('tokenForLog hanya menampilkan 8 karakter pertama', () => {
    const { token } = generateToken(M, 'SH', SECRET);
    const shown = tokenForLog(token);
    expect(shown.length).toBe(8 + 3);
    expect(shown.endsWith('...')).toBe(true);
    expect(token.startsWith(shown.slice(0, 8))).toBe(true);
  });

  it('tokenForLog aman untuk input kosong', () => {
    expect(tokenForLog(undefined)).toBe('(kosong)');
    expect(tokenForLog('')).toBe('(kosong)');
  });
});