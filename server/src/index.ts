import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env, isProduction } from './config/env.js';
import { warnIfMaterialColumnsUnset } from './config/mrpColumns.js';
import { createPool, type Executor } from './db/pool.js';
import { createDummyExecutor } from './db/dummy.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createApprovalRouter } from './routes/mrpApproval.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');

export function createApp(db: Awaited<ReturnType<typeof createPool>>) {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: isProduction ? undefined : false }));
  app.use(express.json({ limit: '64kb' }));
  app.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }));

  // Development memakai proxy Vite sehingga tidak ada CORS sama sekali.
  // CORS hanya dibuka untuk kasus development tanpa proxy (mis. backend CI memanggil API lewat origin berbeda).
  app.use(cors({ origin: isProduction ? false : true }));

  app.get('/api/health', (_req, res) => {
    res.status(200).json({ success: true, status: 'ok' });
  });

  app.use('/api/mrpApproval', createApprovalRouter(db));

  app.use('/api', notFoundHandler);

  // Production: Express melayani static client dari satu origin, tanpa CORS.
  if (isProduction) {
    app.use(express.static(CLIENT_DIST));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(CLIENT_DIST, 'index.html'));
    });
  }

  app.use(errorHandler);

  return app;
}

async function main(): Promise<void> {
  const db = env.DUMMY_MODE ? createDummyExecutor() : await createPool();

  if (env.DUMMY_MODE) {
    console.warn('[mrp-approval] DUMMY_MODE aktif: data contoh, database tidak disentuh. Jangan aktifkan di production.');
  } else {
    warnIfMaterialColumnsUnset();
  }

  const app = createApp(db);

  app.listen(env.PORT, () => {
    console.log(`[mrp-approval] API berjalan di http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  main().catch((error) => {
    console.error('[mrp-approval] gagal start:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
