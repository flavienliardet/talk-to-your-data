import {
  Router,
  type Request,
  type Response,
  type Router as RouterType,
} from 'express';
import { authMiddleware, requireAuth } from '../middleware/auth';
import {
  getChatsByUserId,
  getSharedChatsByUserId,
  getUsersByIds,
  isDatabaseAvailable,
} from '@chat-template/db';
import { ChatSDKError } from '@chat-template/core/errors';

export const historyRouter: RouterType = Router();

// Apply auth middleware
historyRouter.use(authMiddleware);

/**
 * GET /api/history - Get chat history for authenticated user
 */
historyRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  console.log('[/api/history] Handler called');

  // Return 204 No Content if database is not available
  const dbAvailable = isDatabaseAvailable();
  console.log('[/api/history] Database available:', dbAvailable);

  if (!dbAvailable) {
    console.log('[/api/history] Returning 204 No Content');
    return res.status(204).end();
  }

  const session = req.session;
  if (!session) {
    const error = new ChatSDKError('unauthorized:chat');
    const response = error.toResponse();
    return res.status(response.status).json(response.json);
  }

  const limit = Number.parseInt((req.query.limit as string) || '10');
  const startingAfter = req.query.starting_after as string | undefined;
  const endingBefore = req.query.ending_before as string | undefined;
  const sharedOnly = req.query.shared_only === 'true';

  if (startingAfter && endingBefore) {
    const error = new ChatSDKError(
      'bad_request:api',
      'Only one of starting_after or ending_before can be provided.',
    );
    const response = error.toResponse();
    return res.status(response.status).json(response.json);
  }

  const enrichWithSharer = async (chats: Array<{ sharedByUserId?: string | null }>) => {
    const sharedByIds = [
      ...new Set(
        chats
          .map((c) => c.sharedByUserId)
          .filter((id): id is string => id != null && id !== '')
          .map((id) => String(id)),
      ),
    ];
    const sharers = await getUsersByIds(sharedByIds);
    const sharerMap = new Map(
      sharers.map((u) => [String(u.id), { id: u.id, email: u.email }]),
    );
    return chats.map((c) => ({
      ...c,
      sharedBy:
        c.sharedByUserId != null
          ? sharerMap.get(String(c.sharedByUserId))
          : undefined,
    }));
  };

  try {
    if (sharedOnly) {
      const sharedLimit = Number.parseInt((req.query.limit as string) || '100');
      const { chats } = await getSharedChatsByUserId({
        id: session.user.id,
        limit: Math.min(sharedLimit, 100),
      });
      const enrichedChats = await enrichWithSharer(chats);
      return res.json({ chats: enrichedChats, hasMore: false });
    }

    const { chats, hasMore } = await getChatsByUserId({
      id: session.user.id,
      limit,
      startingAfter: startingAfter ?? null,
      endingBefore: endingBefore ?? null,
    });

    const enrichedChats = await enrichWithSharer(chats);

    res.json({ chats: enrichedChats, hasMore });
  } catch (error) {
    console.error('[/api/history] Error in handler:', error);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});
