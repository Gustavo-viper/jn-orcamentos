import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { firstZodError } from '@jn/shared';
import { config } from './config.js';
import { HttpError } from './lib/errors.js';
import { csrfGuard } from './services/auth.js';
import { logError } from './services/audit.js';
import { authRouter, usersRouter } from './routes/auth.js';
import { adminRouter, eventsRouter, historyRouter, portalRouter, syncRouter } from './routes/api.js';

export function createApp() {
  const app = express();
  if (config.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'img-src': ["'self'", 'data:', 'blob:'],
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'connect-src': ["'self'", 'https://viacep.com.br'],
          'worker-src': ["'self'", 'blob:'],
          'upgrade-insecure-requests': config.cookieSecure ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(cookieParser());
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', (req, res, next) => (req.path.startsWith('/sync/push') || req.path.startsWith('/admin/restore') ? next() : express.json({ limit: '1mb' })(req, res, next)));

  app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  // portal é público e não usa cookies de sessão
  app.use('/api/portal', portalRouter);
  app.use('/api', csrfGuard);
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/sync', syncRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/history', historyRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

  // Frontend (PWA) compilado
  if (fs.existsSync(config.webDist)) {
    app.use(
      express.static(config.webDist, {
        index: false,
        setHeaders: (res, file) => {
          if (file.endsWith('sw.js') || file.endsWith('index.html') || file.endsWith('manifest.webmanifest')) res.setHeader('Cache-Control', 'no-cache');
          else if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
      }),
    );
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(config.webDist, 'index.html'));
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code });
    if (err instanceof ZodError) return res.status(400).json({ error: firstZodError(err) });
    if ((err as { type?: string })?.type === 'entity.too.large') return res.status(413).json({ error: 'Arquivo ou dados grandes demais.' });
    if ((err as { type?: string })?.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' });
    void logError(`http ${req.method} ${req.path}`, err, undefined, req.user?.id);
    res.status(500).json({ error: 'Erro interno do servidor. A falha foi registrada.' });
  });
  return app;
}
