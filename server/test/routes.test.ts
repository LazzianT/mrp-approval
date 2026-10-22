import { beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import type { Executor, Queryable } from '../src/db/pool.js';
import { MRP_HEADER_COLUMNS } from '../src/config/mrpColumns.js';
import { STAGES, type StageCode } from '../src/config/stages.js';
const SECRET = 'secret-uji-routes-minimal-32-karakter-panjang';
const API_KEY = 'api-key-uji-123456';
const M = 'MRP/2026/10/001';

let app: Express;
let tokenModule: typeof import('../src/services/token.js');
let db: FakeHttpDb;

process.env.TOKEN_SECRET = SECRET;
process.env.API_KEY = API_KEY;
process.env.APP_URL = 'https://approval.test';
process.env.DB_HOST = 'localhost';
process.env.DB_USER = 'sa';
process.env.DB_PASSWORD = 'x';
process.env.DB_NAME = 'BMC';
process.env.NODE_ENV = 'test';
// .env lokal bisa menyalakan DUMMY_MODE untuk pengembangan UI; test ini
// wajib menguji jalur database sungguhan.
process.env.DUMMY_MODE = 'false';

class FakeHttpDb implements Executor {
  approvedStages: StageCode[] = [];
  missing = false;

  private row() {
    const row: Record<string, unknown> = {
      [MRP_HEADER_COLUMNS.mrpNo]: M,
      [MRP_HEADER_COLUMNS.mrpDate]: new Date('2026-10-01'),
      [MRP_HEADER_COLUMNS.jenis]: 'Reguler',
      [MRP_HEADER_COLUMNS.requestor]: '1234',
      [MRP_HEADER_COLUMNS.keperluan]: 'Pemeliharaan mesin',
      [MRP_HEADER_COLUMNS.departId]: 'D01',
      [MRP_HEADER_COLUMNS.totalHargaApproved]: 130000000,
    };

    for (const stage of STAGES) {
      const done = this.approvedStages.includes(stage.code);
      row[stage.nameColumn] = done ? `Approver ${stage.code}` : null;
      row[stage.dateColumn] = done ? new Date(`2026-10-0${STAGES.indexOf(stage) + 1}`) : null;
    }
    return row;
  }

  query = async <T,>(sql: string): Promise<T[]> => {
    if (this.missing) return [];
    if (sql.includes('MASCOSTCENTER')) return [{ NamaDepartemen: 'Produksi' } as T];
    if (sql.includes('hris_Employee')) {
      return [{ NIP: '1234', Name: 'Andi Wijaya', DepartID: 'D01' } as T];
    }
    if (sql.includes('PURCH_MRP_NOTE')) return [{ total: 125000000, note: null, departId: 'D01' } as T];
    if (sql.includes('AS materialId')) return [] as T[];
    if (sql.includes('AS approverName')) return [{ approverName: 'Budi Santoso' } as T];
    if (sql.includes(MRP_HEADER_COLUMNS.mrpDate)) return [this.row() as T];
    return [];
  };

  execute = async (sql: string): Promise<number> => {
    const nameColumn = /SET (\w+) = @approverName/.exec(sql)?.[1];
    if (!nameColumn) return 1;
    const stage = STAGES.find((s) => s.nameColumn === nameColumn);
    if (!stage || this.approvedStages.includes(stage.code)) return 0;
    this.approvedStages.push(stage.code);
    return 1;
  };

  transaction = async <T,>(fn: (tx: Queryable) => Promise<T>): Promise<T> => fn(this);
}

beforeAll(async () => {
  tokenModule = await import('../src/services/token.js');
  const { createApp } = await import('../src/index.js');
  db = new FakeHttpDb();
  app = createApp(db as unknown as Executor);
});

function freshToken(overrides: Partial<{ exp: number; tahap: StageCode; mrpNo: string }> = {}) {
  const { token } = tokenModule.generateToken(
    overrides.mrpNo ?? M,
    overrides.tahap ?? 'SH',
    SECRET,
    overrides.exp !== undefined ? overrides.exp : Date.now() + 60_000,
  );
  return token;
}

describe('GET /api/mrpApproval/detail', () => {
  it('token valid -> detail lengkap dengan nama dari hris dan departemen dari MASCOSTCENTER', async () => {
    db.approvedStages = [];
    db.missing = false;

    const res = await request(app).get('/api/mrpApproval/detail').query({ token: freshToken() });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.mrpNo).toBe(M);
    expect(res.body.data.requester.name).toBe('Andi Wijaya');
    expect(res.body.data.requester.departemen).toBe('Produksi');
    expect(res.body.data.approver.name).toBe('Budi Santoso');
    expect(res.body.data.tahapLabel).toBe('Section Head');
    expect(res.body.data.total).toBe(125000000);
  });

  it('token diubah satu karakter -> reason invalid', async () => {
    const token = freshToken();
    const tampered = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;

    const res = await request(app).get('/api/mrpApproval/detail').query({ token: tampered });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.reason).toBe('invalid');
  });

  it('token lewat 72 jam -> reason expired', async () => {
    const token = tokenModule.generateToken(M, 'SH', SECRET).token;
    const expired = tokenModule.createToken(
      { mrpNo: M, tahap: 'SH', exp: Date.now() - 1000, nonce: 'a'.repeat(32) },
      SECRET,
    );

    const res = await request(app).get('/api/mrpApproval/detail').query({ token: expired });

    expect(res.status).toBe(200);
    expect(res.body.reason).toBe('expired');
    expect(token).toBeTruthy();
  });

  it('tanpa token -> 400 dengan pesan jelas', async () => {
    const res = await request(app).get('/api/mrpApproval/detail');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('ALLOW_UNSIGNED_LINK mati -> payload tetap ditolak', async () => {
    const res = await request(app).get('/api/mrpApproval/detail').query({ m: 'apa-saja' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('ALLOW_UNSIGNED_LINK hidup -> payload terenkripsi bisa membuka detail', async () => {
    // Import dinamis: env.ts harus dibaca SETELAH process.env di atas disetel.
    const { env } = await import('../src/config/env.js');
    const { encryptMrpNo } = await import('../src/services/crypto.js');
    env.ALLOW_UNSIGNED_LINK = true;
    db.approvedStages = [];
    const res = await request(app)
      .get('/api/mrpApproval/detail')
      .query({ m: encryptMrpNo('MRP/2026/10/001') });
    env.ALLOW_UNSIGNED_LINK = false;

    expect(res.body.success).toBe(true);
    expect(res.body.data.mrpNo).toBe('MRP/2026/10/001');
    expect(res.body.data.tahap).toBe('SH');
  });

  it('payload rusak atau disamarkan -> ditolak', async () => {
    const { env } = await import('../src/config/env.js');
    const { encryptMrpNo } = await import('../src/services/crypto.js');
    env.ALLOW_UNSIGNED_LINK = true;
    const sah = encryptMrpNo('MRP/2026/10/001');
    const rusak = `${sah.slice(0, -4)}AAAA`;
    const res = await request(app).get('/api/mrpApproval/detail').query({ m: rusak });
    env.ALLOW_UNSIGNED_LINK = false;

    expect(res.body.success).toBe(false);
  });

  it('MRP tidak ada -> reason not_found', async () => {
    db.missing = true;
    const res = await request(app).get('/api/mrpApproval/detail').query({ token: freshToken() });
    db.missing = false;

    expect(res.body.success).toBe(false);
    expect(res.body.reason).toBe('not_found');
  });

  it('semua tahap terisi -> already_processed beserta siapa dan kapan', async () => {
    db.approvedStages = STAGES.map((s) => s.code);
    const res = await request(app).get('/api/mrpApproval/detail').query({ token: freshToken() });
    db.approvedStages = [];

    expect(res.body.reason).toBe('already_processed');
    expect(res.body.processedBy).toBe('Approver CFO');
    expect(res.body.processedAt).toBeTruthy();
  });

  it('token untuk tahap yang sudah lewat -> stage_mismatch', async () => {
    db.approvedStages = ['SH', 'GH'];
    const res = await request(app).get('/api/mrpApproval/detail').query({ token: freshToken({ tahap: 'SH' }) });
    db.approvedStages = [];

    expect(res.body.reason).toBe('stage_mismatch');
  });
});

describe('POST /api/mrpApproval/submit', () => {
  it('approve menulis tahap dan mengembalikan nextTahap', async () => {
    db.approvedStages = [];
    const res = await request(app)
      .post('/api/mrpApproval/submit')
      .send({ token: freshToken(), decision: 'approve' });

    expect(res.body.success).toBe(true);
    expect(res.body.decision).toBe('approve');
    expect(res.body.tahap).toBe('SH');
    expect(res.body.nextTahap).toBe('IC');
    expect(db.approvedStages).toEqual(['SH']);
  });

  it('approve dua kali -> hanya satu update', async () => {
    db.approvedStages = [];
    const token = freshToken();
    await request(app).post('/api/mrpApproval/submit').send({ token, decision: 'approve' });
    const second = await request(app).post('/api/mrpApproval/submit').send({ token, decision: 'approve' });

    expect(second.body.success).toBe(false);
    expect(second.body.reason).toBe('already_processed');
    expect(db.approvedStages).toEqual(['SH']);
  });

  it('reject tanpa alasan -> validation_error di server', async () => {
    db.approvedStages = [];
    const res = await request(app)
      .post('/api/mrpApproval/submit')
      .send({ token: freshToken(), decision: 'reject' });

    expect(res.body.success).toBe(false);
    expect(res.body.reason).toBe('validation_error');
    expect(db.approvedStages).toEqual([]);
  });

  it('reject dengan alasan -> sukses tanpa menggeser tahap', async () => {
    db.approvedStages = [];
    const res = await request(app)
      .post('/api/mrpApproval/submit')
      .send({ token: freshToken(), decision: 'reject', note: 'Anggaran tidak tersedia' });

    expect(res.body.success).toBe(true);
    expect(res.body.decision).toBe('reject');
    expect(res.body.nextTahap).toBeNull();
    expect(db.approvedStages).toEqual([]);
  });

  it('token tampered pada submit -> invalid, tidak ada update', async () => {
    db.approvedStages = [];
    const token = freshToken();
    const tampered = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;

    const res = await request(app)
      .post('/api/mrpApproval/submit')
      .send({ token: tampered, decision: 'approve' });

    expect(res.body.reason).toBe('invalid');
    expect(db.approvedStages).toEqual([]);
  });

  it('decision tidak dikenal -> 400', async () => {
    const res = await request(app)
      .post('/api/mrpApproval/submit')
      .send({ token: freshToken(), decision: 'hapus' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/mrpApproval/createLink', () => {
  it('tanpa x-api-key -> 401', async () => {
    const res = await request(app).post('/api/mrpApproval/createLink').send({ mrpNo: M });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('x-api-key benar -> token dan url yang bisa dibuka', async () => {
    const res = await request(app)
      .post('/api/mrpApproval/createLink')
      .set('x-api-key', API_KEY)
      .send({ mrpNo: M, tahap: 'SH' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.url).toBe(`https://approval.test/approve?token=${encodeURIComponent(res.body.token)}`);

    const detail = await request(app)
      .get('/api/mrpApproval/detail')
      .query({ token: res.body.token });
    expect(detail.body.success).toBe(true);
  });

  it('createMessage -> mengembalikan pesan dan link dari server', async () => {
    const res = await request(app)
      .post('/api/mrpApproval/createMessage')
      .set('x-api-key', API_KEY)
      .send({ mrpNo: M, requestor: '1234', tahap: 'SH' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.url).toMatch(/^https:\/\/approval\.test\/approve\?token=/);
    expect(res.body.message).toContain('PERMOHONAN APPROVAL BUDGET PLAN (MRP)');
    expect(res.body.message).toContain(res.body.url);
  });

  it('mrpNo kosong -> 400', async () => {
    const res = await request(app)
      .post('/api/mrpApproval/createLink')
      .set('x-api-key', API_KEY)
      .send({});
    expect(res.status).toBe(400);
  });

  it('tahap tidak dikenal -> 400', async () => {
    const res = await request(app)
      .post('/api/mrpApproval/createLink')
      .set('x-api-key', API_KEY)
      .send({ mrpNo: M, tahap: 'XXX' });
    expect(res.status).toBe(400);
  });
});