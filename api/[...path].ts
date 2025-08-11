import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { FastifyInstance } from 'fastify';
import { initializeDatabase } from '../packages/server/api/src/app/database';
import { initializeLock } from '../packages/server/api/src/app/helper/lock';
import { setupServer } from '../packages/server/api/src/app/server';

let appPromise: Promise<FastifyInstance> | undefined;

async function getApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    appPromise = (async () => {
      process.env.TZ = 'UTC';
      await initializeDatabase({ runMigrations: true });
      initializeLock();
      const app = await setupServer();
      await app.ready();
      return app;
    })();
  }
  return appPromise;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const app = await getApp();
  app.server.emit('request', req, res);
}
