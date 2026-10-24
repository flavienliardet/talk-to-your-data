import {
  Router,
  type Request,
  type Response,
  type Router as RouterType,
} from 'express';
import { authMiddleware, requireAuth } from '../middleware/auth';
import { getUserSettings, updateUserSettings } from '@chat-template/db';

const VALID_RESPONSE_LEVELS = ['exploratoire', 'statistique'] as const;

export const customInstructionsRouter: RouterType = Router();

customInstructionsRouter.use(authMiddleware);

customInstructionsRouter.get(
  '/',
  requireAuth,
  async (req: Request, res: Response) => {
    const userId = req.session?.user.id;

    const row = await getUserSettings({ userId });

    res.json({
      customInstructions: row?.customInstructions ?? '',
      responseLevel:
        row?.responseLevel && VALID_RESPONSE_LEVELS.includes(row.responseLevel as (typeof VALID_RESPONSE_LEVELS)[number])
          ? row.responseLevel
          : 'exploratoire',
    });
  },
);

customInstructionsRouter.put(
  '/',
  requireAuth,
  async (req: Request, res: Response) => {
    const userId = req.session?.user.id;
    const { customInstructions, responseLevel } = req.body;

    const updates: { customInstructions?: string; responseLevel?: string } = {};

    if (customInstructions !== undefined) {
      if (typeof customInstructions !== 'string') {
        return res
          .status(400)
          .json({ error: 'customInstructions must be a string' });
      }
      updates.customInstructions = customInstructions;
    }

    if (responseLevel !== undefined) {
      if (
        typeof responseLevel !== 'string' ||
        !VALID_RESPONSE_LEVELS.includes(responseLevel as (typeof VALID_RESPONSE_LEVELS)[number])
      ) {
        return res
          .status(400)
          .json({
            error:
              'responseLevel must be one of: exploratoire, statistique',
          });
      }
      updates.responseLevel = responseLevel;
    }

    if (Object.keys(updates).length === 0) {
      const row = await getUserSettings({ userId });
      return res.json({
        customInstructions: row?.customInstructions ?? '',
        responseLevel:
          row?.responseLevel && VALID_RESPONSE_LEVELS.includes(row.responseLevel as (typeof VALID_RESPONSE_LEVELS)[number])
            ? row.responseLevel
            : 'exploratoire',
      });
    }

    await updateUserSettings({ userId, ...updates });

    const row = await getUserSettings({ userId });
    res.json({
      customInstructions: row?.customInstructions ?? '',
      responseLevel:
        row?.responseLevel && VALID_RESPONSE_LEVELS.includes(row.responseLevel as (typeof VALID_RESPONSE_LEVELS)[number])
          ? row.responseLevel
          : 'exploratoire',
    });
  },
);
