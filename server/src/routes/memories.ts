import {
  Router,
  type Request,
  type Response,
  type Router as RouterType,
} from 'express';
import { authMiddleware, requireAuth } from '../middleware/auth';
import {
  getUserMemories,
  deleteUserMemory,
  deleteAllUserMemories,
} from '@chat-template/db';

export const memoriesRouter: RouterType = Router();

memoriesRouter.use(authMiddleware);

memoriesRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  const userId = req.session?.user.email ?? req.session?.user.id ?? '';
  const memories = await getUserMemories({ userId });
  res.json({ memories });
});

memoriesRouter.delete(
  '/:key',
  requireAuth,
  async (req: Request, res: Response) => {
    const userId = req.session?.user.email ?? req.session?.user.id ?? '';
    const { key } = req.params;

    if (!key) {
      return res.status(400).json({ error: 'key is required' });
    }

    await deleteUserMemory({ userId, key });
    res.json({ success: true });
  },
);

memoriesRouter.delete('/', requireAuth, async (req: Request, res: Response) => {
  const userId = req.session?.user.email ?? req.session?.user.id ?? '';
  await deleteAllUserMemories({ userId });
  res.json({ success: true });
});
