import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { BLOCKING_STAGES, DEFAULT_STAGE, isStageCode, type StageCode } from '../config/stages.js';
import { env } from '../config/env.js';
import { stageLabelOf } from '../db/queries/mrp.js';
import type { Executor } from '../db/pool.js';
import { requireApiKey } from '../middleware/apiKey.js';
import { HttpError, asyncHandler } from '../middleware/errorHandler.js';
import {
  loadDetail,
  resolveApproverName,
  submitDecision,
} from '../services/approval.js';
import { buildDummyDetail } from '../services/dummyDetail.js';
import { TokenError, TOKEN_TTL_MS, base64urlDecode, generateToken, tokenForLog, verifyToken } from '../services/token.js';

const createLinkSchema = z.object({
  mrpNo: z.string().min(1, 'mrpNo wajib diisi'),
  tahap: z.string().optional(),
  approverNip: z.string().min(1).optional(),
});

const submitSchema = z.object({
  token: z.string().min(1, 'token wajib diisi'),
  decision: z.enum(['approve', 'reject']),
  note: z.string().max(2000).optional(),
});

const MIN_REJECT_NOTE_LENGTH = 5;

/**
 * Tahap blocking berikutnya untuk simulasi mode dummy.
 * Memakai STAGES supaya otomatis sama dengan Stage.blocking (GH & DH dilewati).
 */
function nextStageCode(code: StageCode): StageCode | null {
  const order = BLOCKING_STAGES.map((s) => s.code);
  const index = order.indexOf(code);
  return index >= 0 && index < order.length - 1 ? (order[index + 1] as StageCode) : null;
}

const submitLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    reason: 'server_error' as const,
    message: 'Terlalu banyak permintaan. Mohon tunggu satu menit sebelum mencoba lagi.',
  },
});

/**
 * Semua kegagalan pada endpoint approval dibalas HTTP 200 dengan success:false
 * supaya frontend cukup membaca satu bentuk respons. Error infrastructure
 * (API key salah, rate limit) tetap memakai HTTP error biasa.
 */
function fail(res: import('express').Response, reason: string, message: string, extra?: Record<string, unknown>): void {
  res.status(200).json({ success: false, reason, message, ...extra });
}

function readToken(req: Request): string {
  const fromQuery = req.query.token;
  if (typeof fromQuery === 'string' && fromQuery.length > 0) return fromQuery;
  throw new HttpError(400, 'Parameter token wajib diisi.');
}

/**
 * Mode data dummy: token apa pun diterima, tidak ada yang diverifikasi dan
 * tidak ada query database. Hanya untuk merapikan tampilan.
 */
function readDummyPayload(token: string): { mrpNo: string; tahap: StageCode; exp: number } {
  const raw = token === 'dummy' ? '' : token;
  let mrpNo = 'MRP/2026/10/001';
  let tahap: StageCode = DEFAULT_STAGE;

  if (raw) {
    const [payloadB64] = raw.split('.');
    try {
      const parsed = JSON.parse(base64urlDecode(payloadB64 ?? '').toString('utf8')) as {
        mrpNo?: string;
        tahap?: string;
      };
      if (parsed.mrpNo) mrpNo = parsed.mrpNo;
      if (parsed.tahap && isStageCode(parsed.tahap)) tahap = parsed.tahap;
    } catch {
      // Token bukan token pun -> tetap pakai MRP contoh.
    }
  }

  return { mrpNo, tahap, exp: Date.now() + TOKEN_TTL_MS };
}

export function createApprovalRouter(db: Executor): Router {
  const router = Router();

  router.post('/createLink', requireApiKey, (req, res) => {
    const body = createLinkSchema.parse(req.body);
    const tahap = (body.tahap ?? DEFAULT_STAGE).toUpperCase();
    if (!isStageCode(tahap)) {
      throw new HttpError(400, `Tahap "${body.tahap}" tidak dikenal.`);
    }

    const { token } = generateToken(body.mrpNo, tahap, env.TOKEN_SECRET, undefined, Date.now(), body.approverNip);
    // PUBLIC_APP_URL dipakai kalau diisi, karena tautan ini dibuka dari HP dan
    // localhost tidak berlaku di sana.
    const baseUrl = (env.PUBLIC_APP_URL ?? env.APP_URL).replace(/\/+$/, '');
    const url = `${baseUrl}/approve?token=${encodeURIComponent(token)}`;

    console.log(`[mrp-approval] createLink mrpNo=${body.mrpNo} tahap=${tahap} token=${tokenForLog(token)}`);

    res.status(200).json({ success: true, token, url });
  });

router.get(
    '/detail',
    asyncHandler(async (req, res) => {
      const token = readToken(req);

      if (env.DUMMY_MODE) {
        const dummy = readDummyPayload(token);
        res.status(200).json({ success: true, data: buildDummyDetail(dummy.mrpNo, dummy.tahap, dummy.exp) });
        return;
      }

      let payload;
    try {
      payload = verifyToken(token, env.TOKEN_SECRET);
    } catch (error) {
      if (error instanceof TokenError) {
        fail(res, error.reason, error.message);
        return;
      }
      throw error;
    }

    const result = await loadDetail(db, payload.mrpNo, payload.tahap, payload.exp, payload.approverNip);
    if (!result.ok || !result.detail) {
      fail(res, result.reason ?? 'not_found', result.message ?? 'Data tidak dapat ditampilkan.', {
        ...(result.processedBy ? { processedBy: result.processedBy } : {}),
        ...(result.processedAt ? { processedAt: result.processedAt } : {}),
      });
      return;
    }

    res.status(200).json({ success: true, data: result.detail });
    }),
  );

  router.post(
    '/submit',
    submitLimiter,
asyncHandler(async (req, res) => {
      const body = submitSchema.parse(req.body);

      if (env.DUMMY_MODE) {
        // Disimulasikan supaya alur tombol bisa dicoba tanpa database.
        const ok = body.decision === 'reject' ? (body.note ?? '').trim().length >= MIN_REJECT_NOTE_LENGTH : true;
        if (!ok) {
          fail(
            res,
            'validation_error',
            `Alasan penolakan wajib diisi minimal ${MIN_REJECT_NOTE_LENGTH} karakter.`,
          );
          return;
        }

        const dummy = readDummyPayload(body.token);
        const nextStage = nextStageCode(dummy.tahap);

        res.status(200).json({
          success: true,
          decision: body.decision,
          tahap: dummy.tahap,
          nextTahap: body.decision === 'approve' ? nextStage : null,
          nextTahapLabel: body.decision === 'approve' && nextStage ? stageLabelOf(nextStage) : null,
        });
        return;
      }

      let payload;
    try {
      payload = verifyToken(body.token, env.TOKEN_SECRET);
    } catch (error) {
      if (error instanceof TokenError) {
        fail(res, error.reason, error.message);
        return;
      }
      throw error;
    }

    if (body.decision === 'reject') {
      const note = (body.note ?? '').trim();
      if (note.length < MIN_REJECT_NOTE_LENGTH) {
        fail(
          res,
          'validation_error',
          `Alasan penolakan wajib diisi minimal ${MIN_REJECT_NOTE_LENGTH} karakter.`,
        );
        return;
      }
    }

    const approverName = await resolveApproverName(db, payload.mrpNo, payload.tahap, payload.approverNip);

    const outcome = await submitDecision(db, {
      mrpNo: payload.mrpNo,
      stage: payload.tahap,
      decision: body.decision,
      approverName,
      note: body.note?.trim(),
    });

    if (!outcome.ok) {
      fail(res, outcome.reason, outcome.message, {
        ...(outcome.processedBy ? { processedBy: outcome.processedBy } : {}),
        ...(outcome.processedAt ? { processedAt: outcome.processedAt } : {}),
      });
      return;
    }

    console.log(
      `[mrp-approval] submit ${body.decision} mrpNo=${payload.mrpNo} tahap=${payload.tahap} ` +
        `token=${tokenForLog(body.token)} next=${outcome.nextTahap ?? stageLabelOf('DONE')}`,
    );

    res.status(200).json({
      success: true,
      decision: body.decision,
      tahap: payload.tahap,
      nextTahap: outcome.nextTahap,
      nextTahapLabel: outcome.nextTahap ? stageLabelOf(outcome.nextTahap) : null,
    });
    }),
  );

  return router;
}