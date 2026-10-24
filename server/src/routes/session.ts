import { Router, type Request, type Response, type Router as RouterType } from 'express';
import { authMiddleware } from '../middleware/auth';
import type { ClientSession } from '@chat-template/auth';
import { getCachedCliHost } from '@chat-template/auth';
import { getHostUrl } from '@chat-template/utils';
import { upsertUser } from '@chat-template/db';

export const sessionRouter: RouterType = Router();

// Apply auth middleware
sessionRouter.use(authMiddleware);

function getDatabricksHostForClient(): string | undefined {
  try {
    const cachedHost = getCachedCliHost();
    if (cachedHost) return cachedHost;
    return getHostUrl();
  } catch {
    return undefined;
  }
}

/**
 * GET /api/session - Get current user session
 */
sessionRouter.get('/', async (req: Request, res: Response) => {
  console.log('GET /api/session', req.session);
  const session = req.session;

  if (!session?.user) {
    return res.json({ user: null } as ClientSession);
  }

  await upsertUser({
    id: session.user.id,
    email: session.user.email ?? `${session.user.id}@unknown`,
  });

  const clientSession: ClientSession = {
    user: {
      email: session.user.email,
      name: session.user.name,
      preferredUsername: session.user.preferredUsername,
    },
    databricksHost: getDatabricksHostForClient(),
  };

  res.json(clientSession);
});
