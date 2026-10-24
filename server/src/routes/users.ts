import {
  Router,
  type Request,
  type Response,
  type Router as RouterType,
} from 'express';
import { authMiddleware, requireAuth } from '../middleware/auth';
import { getUsers } from '@chat-template/db';

export const usersRouter: RouterType = Router();

usersRouter.use(authMiddleware);

/**
 * GET /api/users - List users (option A: from app User table)
 * Query: ?q= optional search (email or id), ?limit= optional max results
 */
usersRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const limitParam = req.query.limit;
    const limit =
      typeof limitParam === 'string'
        ? Number.parseInt(limitParam, 10)
        : undefined;
    const validLimit =
      limit !== undefined && Number.isFinite(limit) && limit > 0 && limit <= 200
        ? limit
        : undefined;

    const users = await getUsers({ q, limit: validLimit });
    res.json({ users });
  } catch (error) {
    console.error('Error listing users:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});
