import { beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';

let app: Express;

beforeAll(async () => {
  process.env.TOKEN_SECRET = 'secret-dummy-mode-minimal-32-karakter-panjang';
  process.env.API_KEY = 'api-key-dummy-123456';
  process.env.APP_URL = 'https://approval.test';
  process.env.DB_HOST = 'localhost';
  process.env.DB_USER = 'sa';
  process.env.DB_PASSWORD = 'x';
  process.env.DB_NAME = 'BMC';
  process.env.NODE_ENV = 'test';
  process.env.DUMMY_MODE = 'true';

  const { createApp } = await import('../src/index.js');
  app = createApp({} as never);
});

describe('DUMMY_MODE', () => {
  it('token=dummy dirender tanpa menyentuh database', async () => {
    const res = await request(app).get('/api/mrpApproval/detail').query({ token: 'dummy' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.mrpNo).toBe('MRP/2026/10/001');
    expect(res.body.data.requester.name).toBe('Andi Wijaya');
    expect(res.body.data.requester.departemen).toBe('Produksi');
    expect(res.body.data.tahapLabel).toBe('Section Head');
    expect(res.body.data.materials.length).toBeGreaterThan(0);
  });

  it('approve disimulasikan dengan nextTahap', async () => {
    const res = await request(app)
      .post('/api/mrpApproval/submit')
      .send({ token: 'dummy', decision: 'approve' });

    expect(res.body.success).toBe(true);
    expect(res.body.tahap).toBe('SH');
    expect(res.body.nextTahap).toBe('IC');
  });

  it('reject tanpa alasan ditolak, dengan alasan tidak menggeser tahap', async () => {
    const short = await request(app)
      .post('/api/mrpApproval/submit')
      .send({ token: 'dummy', decision: 'reject', note: 'abc' });
    expect(short.body.reason).toBe('validation_error');

    const valid = await request(app)
      .post('/api/mrpApproval/submit')
      .send({ token: 'dummy', decision: 'reject', note: 'Anggaran tidak tersedia' });
    expect(valid.body.success).toBe(true);
    expect(valid.body.nextTahap).toBeNull();
  });
});