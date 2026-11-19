import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { getDb } from './server/db/database';
import { createApiRouter } from './server/routes/api';
import { startMonitoringWorker } from './server/workers/monitoringWorker';

export async function createTruthOsApp(): Promise<express.Express> {
  getDb();
  const app = express();

  app.disable('x-powered-by');
  app.use('/api', createApiRouter());

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  } else if (process.env.VITEST !== 'true') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  return app;
}

if (process.env.VITEST !== 'true') {
  const port = Number(process.env.PORT || 3000);
  createTruthOsApp()
    .then((app) => {
      startMonitoringWorker(60_000);
      app.listen(port, '0.0.0.0', () => {
        console.log(`TRUTHOS server listening on http://0.0.0.0:${port}`);
      });
    })
    .catch((err) => {
      console.error('Failed to start TRUTHOS server:', err);
      process.exit(1);
    });
}
