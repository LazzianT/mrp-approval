import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';

/** Perbandingan constant-time supaya kunci API tidak bisa ditebak lewat timing. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const provided = req.header('x-api-key');
  if (!provided || !safeEqual(provided, env.API_KEY)) {
    res.status(401).json({
      success: false,
      reason: 'invalid',
      message: 'API key tidak valid.',
    });
    return;
  }
  next();
}