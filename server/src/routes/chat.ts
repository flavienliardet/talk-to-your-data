import {
  Router,
  type Request,
  type Response,
  type Router as RouterType,
} from 'express';
import {
  convertToModelMessages,
  createUIMessageStream,
  streamText,
  generateText,
  type LanguageModelUsage,
  pipeUIMessageStreamToResponse,
} from 'ai';
import type { LanguageModelV3Usage } from '@ai-sdk/provider';

// Convert ai's LanguageModelUsage to @ai-sdk/provider's LanguageModelV3Usage
function toV3Usage(usage: LanguageModelUsage): LanguageModelV3Usage {
  return {
    inputTokens: {
      total: usage.inputTokens,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: usage.outputTokens,
      text: undefined,
      reasoning: undefined,
    },
  };
}
import {
  authMiddleware,
  requireAuth,
  requireChatAccess,
  getIdFromRequest,
} from '../middleware/auth';
import {
  copyChatToUser,
  deleteChatById,
  getChatById,
  getMessagesByChatId,
  saveChat,
  saveMessages,
  updateChatLastConfigById,
  updateChatLastContextById,
  updateChatTitleById,
  updateChatVisiblityById,
  isDatabaseAvailable,
} from '@chat-template/db';
import {
  type ChatMessage,
  checkChatAccess,
  convertToUIMessages,
  generateUUID,
  myProvider,
  postRequestBodySchema,
  type PostRequestBody,
  StreamCache,
  type ThinkingMode,
  type VisibilityType,
  CONTEXT_HEADER_CONVERSATION_ID,
  CONTEXT_HEADER_USER_ID,
  CONTEXT_HEADER_THINKING_MODE,
  CONTEXT_HEADER_CUSTOM_INSTRUCTIONS,
  CONTEXT_HEADER_PERSONA,
  CONTEXT_HEADER_RESPONSE_LEVEL,
  onGraphStep,
  onSuggestedQuestions,
} from '@chat-template/core';
import { ChatSDKError } from '@chat-template/core/errors';

export const chatRouter: RouterType = Router();

const streamCache = new StreamCache();
// Apply auth middleware to all chat routes
chatRouter.use(authMiddleware);

/** POST /api/chat - Send a message and get streaming response */
chatRouter.post('/', requireAuth, async (req: Request, res: Response) => {
  const dbAvailable = isDatabaseAvailable();
  if (!dbAvailable) {
    console.log('[Chat] Running in ephemeral mode - no persistence');
  }

  console.log(`CHAT POST REQUEST ${Date.now()}`);

  let requestBody: PostRequestBody;

  try {
    requestBody = postRequestBodySchema.parse(req.body);
  } catch (_) {
    console.error('Error parsing request body:', _);
    const error = new ChatSDKError('bad_request:api');
    const response = error.toResponse();
    return res.status(response.status).json(response.json);
  }

  try {
    const {
      id,
      message,
      selectedChatModel,
      selectedVisibilityType,
      thinkingMode,
      customInstructions,
      persona,
      responseLevel,
    }: {
      id: string;
      message?: ChatMessage;
      selectedChatModel: string;
      selectedVisibilityType: VisibilityType;
      thinkingMode?: ThinkingMode;
      customInstructions?: string;
      persona?: 'Stock' | 'Cdistrib';
      responseLevel?: 'exploratoire' | 'statistique';
    } = requestBody;

    const session = req.session;
    if (!session) {
      const error = new ChatSDKError('unauthorized:chat');
      const response = error.toResponse();
      return res.status(response.status).json(response.json);
    }

    const { chat, allowed, reason } = await checkChatAccess(
      id,
      session?.user.id,
    );

    if (reason !== 'not_found' && !allowed) {
      const error = new ChatSDKError('forbidden:chat');
      const response = error.toResponse();
      return res.status(response.status).json(response.json);
    }

    if (!chat) {
      // Only create new chat if we have a message (not a continuation)
      if (isDatabaseAvailable() && message) {
        const title = await generateTitleFromUserMessage({ message });

        await saveChat({
          id,
          userId: session.user.id,
          title,
          visibility: selectedVisibilityType,
        });
      }
    } else {
      if (chat.userId !== session.user.id) {
        const error = new ChatSDKError('forbidden:chat');
        const response = error.toResponse();
        return res.status(response.status).json(response.json);
      }
    }

    // Persist last used persona and thinking mode for this conversation
    if (dbAvailable) {
      await updateChatLastConfigById({
        chatId: id,
        persona: persona ?? 'Stock',
        thinkingMode: thinkingMode ?? 'Normal',
      });
    }

    const messagesFromDb = await getMessagesByChatId({ id });

    // Use previousMessages from request body when:
    // 1. Ephemeral mode (DB not available) - always use client-side messages
    // 2. Continuation request (no message) - tool results only exist client-side
    const useClientMessages =
      !dbAvailable || (!message && requestBody.previousMessages);
    const previousMessages = useClientMessages
      ? (requestBody.previousMessages ?? [])
      : convertToUIMessages(messagesFromDb);

    // If message is provided, add it to the list and save it
    // If not (continuation/regeneration), just use previous messages
    let uiMessages: ChatMessage[];
    if (message) {
      uiMessages = [...previousMessages, message];
      await saveMessages({
        messages: [
          {
            chatId: id,
            id: message.id,
            role: 'user',
            parts: message.parts,
            attachments: [],
            createdAt: new Date(),
          },
        ],
      });
    } else {
      // Continuation: use existing messages without adding new user message
      uiMessages = previousMessages as ChatMessage[];

      // For continuations with database enabled, save any updated assistant messages
      // This ensures tool-result parts (like MCP approval responses) are persisted
      if (dbAvailable && requestBody.previousMessages) {
        const assistantMessages = requestBody.previousMessages.filter(
          (m: ChatMessage) => m.role === 'assistant',
        );
        if (assistantMessages.length > 0) {
          await saveMessages({
            messages: assistantMessages.map((m: ChatMessage) => ({
              chatId: id,
              id: m.id,
              role: m.role,
              parts: m.parts,
              attachments: [],
              createdAt: m.metadata?.createdAt
                ? new Date(m.metadata.createdAt)
                : new Date(),
            })),
          });

          // Check if this is an MCP denial - if so, we're done (no need to call LLM)
          // Denial is indicated by a dynamic-tool part with state 'output-denied'
          // or with approval.approved === false
          const hasMcpDenial = requestBody.previousMessages?.some(
            (m: ChatMessage) =>
              m.parts?.some(
                (p) =>
                  p.type === 'dynamic-tool' &&
                  (p.state === 'output-denied' ||
                    ('approval' in p &&
                      (p.approval)?.approved ===
                        false)),
              ),
          );

          if (hasMcpDenial) {
            // We don't need to call the LLM because the user has denied the tool call
            res.end();
            return;
          }
        }
      }
    }

    // Clear any previous active stream for this chat
    streamCache.clearActiveStream(id);

    let finalUsage: LanguageModelUsage | undefined;
    const streamId = generateUUID();

    const model = await myProvider.languageModel(selectedChatModel);
    const result = streamText({
      model,
      messages: await convertToModelMessages(uiMessages),
      headers: {
        [CONTEXT_HEADER_CONVERSATION_ID]: id,
        [CONTEXT_HEADER_USER_ID]: session.user.email ?? session.user.id,
        [CONTEXT_HEADER_THINKING_MODE]: thinkingMode ?? 'Normal',
        [CONTEXT_HEADER_PERSONA]: persona === 'Cdistrib' ? 'Cdistrib' : 'Stock',
        [CONTEXT_HEADER_RESPONSE_LEVEL]:
          responseLevel === 'statistique' || responseLevel === 'exploratoire'
            ? responseLevel
            : 'exploratoire',
        ...(customInstructions
          ? { [CONTEXT_HEADER_CUSTOM_INSTRUCTIONS]: customInstructions }
          : {}),
      },
      onFinish: ({ usage }) => {
        finalUsage = usage;
      },
    });

    let unsubscribeGraphStep: (() => void) | undefined;
    let unsubscribeSuggestedQuestions: (() => void) | undefined;
    let injectedRequeteGenie = false;
    let injectedEnrichissement = false;
    let injectedDecomposer = false;
    let injectedRequeteGenieWorker = false;
    let requeteGenieTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let enrichissementTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let decomposerTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let requeteGenieWorkerTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const isApprofondi = (thinkingMode ?? 'Normal') === 'Approfondi';

    const clearAllStepTimeouts = () => {
      if (requeteGenieTimeoutId) {
        clearTimeout(requeteGenieTimeoutId);
        requeteGenieTimeoutId = null;
      }
      if (enrichissementTimeoutId) {
        clearTimeout(enrichissementTimeoutId);
        enrichissementTimeoutId = null;
      }
      if (decomposerTimeoutId) {
        clearTimeout(decomposerTimeoutId);
        decomposerTimeoutId = null;
      }
      if (requeteGenieWorkerTimeoutId) {
        clearTimeout(requeteGenieWorkerTimeoutId);
        requeteGenieWorkerTimeoutId = null;
      }
    };

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const forwardStep = (fwdStep: { label: string; node: string }) => {
          const ts = Date.now();
          console.log(
            `[GraphStep Server] ts=${ts} chatId=${id} label="${fwdStep.label}" node="${fwdStep.node}" (forwarding to client)`,
          );
          writer.write({
            type: 'data-graph-step',
            data: {
              label: fwdStep.label,
              node: fwdStep.node,
              timestamp: ts,
            },
          });
        };

        unsubscribeGraphStep = onGraphStep(id, (step) => {
          if (
            step.node === 'memory_get' &&
            step.label === 'Récupération mémoire long terme'
          ) {
            forwardStep(step);
            if (!isApprofondi) {
              requeteGenieTimeoutId = setTimeout(() => {
                injectedRequeteGenie = true;
                requeteGenieTimeoutId = null;
                forwardStep({
                  label: 'Requête Genie',
                  node: 'simple_genie',
                });
              }, 500);
            } else {
              enrichissementTimeoutId = setTimeout(() => {
                injectedEnrichissement = true;
                enrichissementTimeoutId = null;
                forwardStep({
                  label: 'Enrichissement de la question',
                  node: 'instruction_builder',
                });
              }, 500);
            }
            return;
          }

          if (
            step.node === 'instruction_builder' &&
            step.label === 'Enrichissement de la question'
          ) {
            if (injectedEnrichissement) return;
            forwardStep(step);
            if (isApprofondi) {
              decomposerTimeoutId = setTimeout(() => {
                injectedDecomposer = true;
                decomposerTimeoutId = null;
                forwardStep({
                  label: 'Décomposition en sous-questions',
                  node: 'decomposer',
                });
              }, 500);
            }
            return;
          }

          if (
            step.node === 'decomposer' &&
            step.label === 'Décomposition en sous-questions'
          ) {
            if (injectedDecomposer) return;
            forwardStep(step);
            if (isApprofondi) {
              requeteGenieWorkerTimeoutId = setTimeout(() => {
                injectedRequeteGenieWorker = true;
                requeteGenieWorkerTimeoutId = null;
                forwardStep({
                  label: 'Requête Genie',
                  node: 'genie_worker',
                });
              }, 500);
            }
            return;
          }

          if (
            step.node === 'simple_genie' &&
            step.label === 'Requête Genie' &&
            injectedRequeteGenie
          ) {
            return;
          }

          if (
            step.node === 'genie_worker' &&
            step.label?.startsWith('Requête Genie') &&
            injectedRequeteGenieWorker
          ) {
            return;
          }

          forwardStep(step);
        });
        unsubscribeSuggestedQuestions = onSuggestedQuestions(id, (questions) => {
          writer.write({
            type: 'data-suggested-questions',
            data: { suggestedQuestions: questions },
          });
        });

        writer.merge(
          result.toUIMessageStream({
            originalMessages: uiMessages,
            generateMessageId: generateUUID,
            sendReasoning: true,
            sendSources: true,
            onError: (error) => {
              console.error('Stream error:', error);

              const errorMessage =
                error instanceof Error ? error.message : JSON.stringify(error);

              writer.write({ type: 'data-error', data: errorMessage });

              return errorMessage;
            },
          }),
        );
      },
      onFinish: async ({ responseMessage }) => {
        clearAllStepTimeouts();
        injectedRequeteGenie = false;
        injectedEnrichissement = false;
        injectedDecomposer = false;
        injectedRequeteGenieWorker = false;
        unsubscribeGraphStep?.();
        unsubscribeSuggestedQuestions?.();
        console.log(
          'Finished message stream! Saving message...',
          JSON.stringify(responseMessage, null, 2),
        );
        await saveMessages({
          messages: [
            {
              id: responseMessage.id,
              role: responseMessage.role,
              parts: responseMessage.parts,
              createdAt: new Date(),
              attachments: [],
              chatId: id,
            },
          ],
        });

        if (finalUsage) {
          try {
            await updateChatLastContextById({
              chatId: id,
              context: toV3Usage(finalUsage),
            });
          } catch (err) {
            console.warn('Unable to persist last usage for chat', id, err);
          }
        }

        streamCache.clearActiveStream(id);
      },
    });

    pipeUIMessageStreamToResponse({
      stream,
      response: res,
      consumeSseStream({ stream }) {
        streamCache.storeStream({
          streamId,
          chatId: id,
          stream,
        });
      },
    });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      const response = error.toResponse();
      return res.status(response.status).json(response.json);
    }

    console.error('Unhandled error in chat API:', error);

    const chatError = new ChatSDKError('offline:chat');
    const response = chatError.toResponse();
    return res.status(response.status).json(response.json);
  }
});

/**
 * DELETE /api/chat?id=:id - Delete a chat
 */
chatRouter.delete(
  '/:id',
  [requireAuth, requireChatAccess],
  async (req: Request, res: Response) => {
    const id = getIdFromRequest(req);
    if (!id) return;

    const deletedChat = await deleteChatById({ id });
    return res.status(200).json(deletedChat);
  },
);

/**
 * GET /api/chat/:id
 */

chatRouter.get(
  '/:id',
  [requireAuth, requireChatAccess],
  async (req: Request, res: Response) => {
    const id = getIdFromRequest(req);
    if (!id) return;

    const { chat } = await checkChatAccess(id, req.session?.user.id);

    return res.status(200).json(chat);
  },
);

/**
 * GET /api/chat/:id/stream - Resume a stream
 */
chatRouter.get(
  '/:id/stream',
  [requireAuth],
  async (req: Request, res: Response) => {
    const chatId = getIdFromRequest(req);
    if (!chatId) return;
    const cursor = req.headers['x-resume-stream-cursor'] as string;

    console.log(`[Stream Resume] Cursor: ${cursor}`);

    console.log(`[Stream Resume] GET request for chat ${chatId}`);

    // Check if there's an active stream for this chat first
    const streamId = streamCache.getActiveStreamId(chatId);

    if (!streamId) {
      console.log(`[Stream Resume] No active stream for chat ${chatId}`);
      const streamError = new ChatSDKError('empty:stream');
      const response = streamError.toResponse();
      return res.status(response.status).json(response.json);
    }

    const { allowed, reason } = await checkChatAccess(
      chatId,
      req.session?.user.id,
    );

    // If chat doesn't exist in DB, it's a temporary chat from the homepage - allow it
    if (reason === 'not_found') {
      console.log(
        `[Stream Resume] Resuming stream for temporary chat ${chatId} (not yet in DB)`,
      );
    } else if (!allowed) {
      console.log(
        `[Stream Resume] User ${req.session?.user.id} does not have access to chat ${chatId} (reason: ${reason})`,
      );
      const streamError = new ChatSDKError('forbidden:chat', reason);
      const response = streamError.toResponse();
      return res.status(response.status).json(response.json);
    }

    // Get all cached chunks for this stream
    const stream = streamCache.getStream(streamId, {
      cursor: cursor ? Number.parseInt(cursor) : undefined,
    });

    if (!stream) {
      console.log(`[Stream Resume] No stream found for ${streamId}`);
      const streamError = new ChatSDKError('empty:stream');
      const response = streamError.toResponse();
      return res.status(response.status).json(response.json);
    }

    console.log(`[Stream Resume] Resuming stream ${streamId}`);

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Pipe the cached stream directly to the response
    stream.pipe(res);

    // Handle stream errors
    stream.on('error', (error) => {
      console.error('[Stream Resume] Stream error:', error);
      if (!res.headersSent) {
        res.status(500).end();
      }
    });
  },
);

/**
 * POST /api/chat/title - Generate title from message
 */
chatRouter.post('/title', requireAuth, async (req: Request, res: Response) => {
  try {
    const { message } = req.body;
    const title = await generateTitleFromUserMessage({ message });
    res.json({ title });
  } catch (error) {
    console.error('Error generating title:', error);
    res.status(500).json({ error: 'Failed to generate title' });
  }
});

/**
 * PATCH /api/chat/:id/title - Update chat title
 */
chatRouter.patch(
  '/:id/title',
  [requireAuth, requireChatAccess],
  async (req: Request, res: Response) => {
    try {
      const id = getIdFromRequest(req);
      if (!id) return;
      const { title } = req.body as { title?: string };

      if (typeof title !== 'string') {
        return res.status(400).json({ error: 'Invalid or missing title' });
      }

      const trimmed = title.trim();
      if (!trimmed) {
        return res.status(400).json({ error: 'Title cannot be empty' });
      }

      if (trimmed.length > 500) {
        return res
          .status(400)
          .json({ error: 'Title must be 500 characters or less' });
      }

      await updateChatTitleById({ chatId: id, title: trimmed });
      res.json({ success: true, title: trimmed });
    } catch (error) {
      if (error instanceof ChatSDKError) {
        const response = error.toResponse();
        return res.status(response.status).json(response.json);
      }
      console.error('Error updating chat title:', error);
      res.status(500).json({ error: 'Failed to update chat title' });
    }
  },
);

/**
 * PATCH /api/chat/:id/visibility - Update chat visibility
 */
chatRouter.patch(
  '/:id/visibility',
  [requireAuth, requireChatAccess],
  async (req: Request, res: Response) => {
    try {
      const id = getIdFromRequest(req);
      if (!id) return;
      const { visibility } = req.body;

      if (!visibility || !['public', 'private'].includes(visibility)) {
        return res.status(400).json({ error: 'Invalid visibility type' });
      }

      await updateChatVisiblityById({ chatId: id, visibility });
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating visibility:', error);
      res.status(500).json({ error: 'Failed to update visibility' });
    }
  },
);

/**
 * POST /api/chat/:id/share - Copy chat to another user (option A: share with app users)
 * Body: { targetUserId: string }
 * Only the chat owner can share.
 */
chatRouter.post(
  '/:id/share',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const id = getIdFromRequest(req);
      if (!id) {
        return res.status(400).json({ error: 'Missing chat id' });
      }
      const { targetUserId } = req.body as { targetUserId?: string };
      if (!targetUserId || typeof targetUserId !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid targetUserId' });
      }

      const existingChat = await getChatById({ id });
      if (!existingChat) {
        return res.status(404).json({ error: 'Chat not found' });
      }
      const currentUserId = req.session?.user?.id;
      if (!currentUserId || existingChat.userId !== currentUserId) {
        return res.status(403).json({ error: 'Only the owner can share this chat' });
      }

      const newChatId = await copyChatToUser({
        chatId: id,
        ownerUserId: currentUserId,
        targetUserId,
      });

      res.status(201).json({ success: true, newChatId });
    } catch (error) {
      if (error instanceof ChatSDKError) {
        const response = error.toResponse();
        return res.status(response.status).json(response.json);
      }
      console.error('Error sharing chat:', error);
      res.status(500).json({ error: 'Failed to share chat' });
    }
  },
);

async function generateTitleFromUserMessage({
  message,
}: {
  message: ChatMessage;
}) {
  const model = await myProvider.languageModel('title-model');
  const { text: title } = await generateText({
    model,
    system: `\n
    - you will generate a short title based on the first message a user begins a conversation with
    - ensure it is not more than 80 characters long
    - the title should be a summary of the user's message
    - do not use quotes or colons. do not include other expository content ("I'll help...")`,
    prompt: JSON.stringify(message),
  });

  return title;
}
