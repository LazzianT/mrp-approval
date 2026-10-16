import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    reason: 'not_found',
    message: `Endpoint ${req.method} ${req.path} tidak tersedia.`,
  });
}

/**
 * Pesan error internal tidak pernah dikirim ke client agar detail
 * (nama kolom, host database, stack trace) tidak bocor lewat link publik.
 */
/**
 * Express 4 tidak meneruskan error dari handler async ke error handler.
 * Tanpa wrapper ini, satu exception akan menggantung request tanpa respons.
 */
export function asyncHandler<T extends Request = Request>(
  handler: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(handler(req as T, res, next)).catch(next);
  };
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({ success: false, reason: 'server_error', message: err.message });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      reason: 'validation_error',
      message: err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '),
    });
    return;
  }

  console.error('[mrp-approval] error tidak tertangani:', err);
  res.status(500).json({
    success: false,
    reason: 'server_error',
    message: 'Terjadi kesalahan pada server. Silakan coba lagi.',
  });
}