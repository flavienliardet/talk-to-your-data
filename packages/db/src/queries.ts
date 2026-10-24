import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  lt,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import {
  chat,
  message,
  user,
  userSettings,
  type DBMessage,
  type Chat,
} from './schema';
import type { VisibilityType } from '@chat-template/utils';
import { ChatSDKError } from '@chat-template/core/errors';
import type { LanguageModelV3Usage } from '@ai-sdk/provider';
import { randomUUID } from 'node:crypto';
import { isDatabaseAvailable } from './connection';
import { getAuthMethod } from '@chat-template/auth';

// Re-export User type for external use
export type { User } from './schema';

// Optionally you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle
let _db: ReturnType<typeof drizzle>;

const getOrInitializeDb = async () => {
  if (!isDatabaseAvailable()) {
    throw new Error(
      'Database configuration required. Please set PGDATABASE/PGHOST/PGUSER or POSTGRES_URL environment variables.',
    );
  }

  if (_db) return _db;

  const authMethod = getAuthMethod();
  if (authMethod === 'oauth' || authMethod === 'cli') {
    // Dynamic auth path - db will be initialized asynchronously via connection-pool
  } else if (process.env.POSTGRES_URL) {
    // Traditional connection string
    const client = postgres(process.env.POSTGRES_URL);
    _db = drizzle(client);
  }

  return _db;
};

async function ensureDb() {
  const db = await getOrInitializeDb();
  const authMethod = getAuthMethod();
  if (authMethod === 'oauth' || authMethod === 'cli') {
    try {
      const { getDb } = await import('./connection-pool.js');
      return await getDb();
    } catch (error) {
      console.error('[ensureDb] Failed to get database connection:', error);
      throw error;
    }
  }

  if (!db) {
    throw new Error('Database connection could not be established');
  }
  return db;
}

export async function saveChat({
  id,
  userId,
  title,
  visibility,
  sharedByUserId,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: VisibilityType;
  sharedByUserId?: string | null;
}) {
  if (!isDatabaseAvailable()) {
    console.log('[saveChat] Database not available, skipping persistence');
    return;
  }

  try {
    return await (await ensureDb()).insert(chat).values({
      id,
      createdAt: new Date(),
      userId,
      title,
      visibility,
      sharedByUserId: sharedByUserId ?? null,
    });
  } catch (error) {
    console.error('[saveChat] Error saving chat:', error);
    throw new ChatSDKError('bad_request:database', 'Failed to save chat');
  }
}

export async function deleteChatById({ id }: { id: string }) {
  if (!isDatabaseAvailable()) {
    console.log('[deleteChatById] Database not available, skipping deletion');
    return null;
  }

  try {
    await (await ensureDb()).delete(message).where(eq(message.chatId, id));

    const [chatsDeleted] = await (await ensureDb())
      .delete(chat)
      .where(eq(chat.id, id))
      .returning();
    return chatsDeleted;
  } catch (_error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to delete chat by id',
    );
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  if (!isDatabaseAvailable()) {
    console.log('[getChatsByUserId] Database not available, returning empty');
    return { chats: [], hasMore: false };
  }

  try {
    const extendedLimit = limit + 1;

    const query = async (whereCondition?: SQL<any>) => {
      const database = await ensureDb();

      return database
        .select()
        .from(chat)
        .where(
          whereCondition
            ? and(whereCondition, eq(chat.userId, id))
            : eq(chat.userId, id),
        )
        .orderBy(desc(chat.createdAt))
        .limit(extendedLimit);
    };

    let filteredChats: Array<Chat> = [];

    if (startingAfter) {
      const database = await ensureDb();
      const [selectedChat] = await database
        .select()
        .from(chat)
        .where(eq(chat.id, startingAfter))
        .limit(1);

      if (!selectedChat) {
        throw new ChatSDKError(
          'not_found:database',
          `Chat with id ${startingAfter} not found`,
        );
      }

      filteredChats = await query(gt(chat.createdAt, selectedChat.createdAt));
    } else if (endingBefore) {
      const database = await ensureDb();
      const [selectedChat] = await database
        .select()
        .from(chat)
        .where(eq(chat.id, endingBefore))
        .limit(1);

      if (!selectedChat) {
        throw new ChatSDKError(
          'not_found:database',
          `Chat with id ${endingBefore} not found`,
        );
      }

      filteredChats = await query(lt(chat.createdAt, selectedChat.createdAt));
    } else {
      filteredChats = await query();
    }

    const hasMore = filteredChats.length > limit;

    return {
      chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
      hasMore,
    };
  } catch (error) {
    console.error('[getChatsByUserId] Error details:', error);
    console.error(
      '[getChatsByUserId] Error stack:',
      error instanceof Error ? error.stack : 'No stack available',
    );
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get chats by user id',
    );
  }
}

export async function getSharedChatsByUserId({
  id,
  limit = 100,
}: {
  id: string;
  limit?: number;
}) {
  if (!isDatabaseAvailable()) {
    return { chats: [] };
  }

  try {
    const chats = await (await ensureDb())
      .select()
      .from(chat)
      .where(and(eq(chat.userId, id), isNotNull(chat.sharedByUserId)))
      .orderBy(desc(chat.createdAt))
      .limit(limit);

    return { chats };
  } catch (error) {
    console.error('[getSharedChatsByUserId] Error:', error);
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get shared chats by user id',
    );
  }
}

export async function getChatById({ id }: { id: string }) {
  if (!isDatabaseAvailable()) {
    console.log('[getChatById] Database not available, returning null');
    return null;
  }

  try {
    const [selectedChat] = await (await ensureDb())
      .select()
      .from(chat)
      .where(eq(chat.id, id));
    if (!selectedChat) {
      return null;
    }

    return selectedChat;
  } catch (_error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get chat by id');
  }
}

export async function saveMessages({
  messages,
}: {
  messages: Array<DBMessage>;
}) {
  if (!isDatabaseAvailable()) {
    console.log('[saveMessages] Database not available, skipping persistence');
    return;
  }

  try {
    // Use upsert to handle both new messages and updates (e.g., MCP approval continuations)
    // When a message ID already exists, update its parts (which may have changed)
    // Using sql`excluded.X` to reference the values that would have been inserted
    return await (await ensureDb())
      .insert(message)
      .values(messages)
      .onConflictDoUpdate({
        target: message.id,
        set: {
          parts: sql`excluded.parts`,
          attachments: sql`excluded.attachments`,
        },
      });
  } catch (_error) {
    throw new ChatSDKError('bad_request:database', 'Failed to save messages');
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  if (!isDatabaseAvailable()) {
    console.log(
      '[getMessagesByChatId] Database not available, returning empty',
    );
    return [];
  }

  try {
    return await (await ensureDb())
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));
  } catch (_error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get messages by chat id',
    );
  }
}

export async function getMessageById({ id }: { id: string }) {
  if (!isDatabaseAvailable()) {
    console.log('[getMessageById] Database not available, returning empty');
    return [];
  }

  try {
    return await (await ensureDb())
      .select()
      .from(message)
      .where(eq(message.id, id));
  } catch (_error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get message by id',
    );
  }
}

export async function copyChatToUser({
  chatId,
  ownerUserId,
  targetUserId,
}: {
  chatId: string;
  ownerUserId: string;
  targetUserId: string;
}): Promise<string> {
  if (!isDatabaseAvailable()) {
    throw new ChatSDKError(
      'bad_request:database',
      'Database not available for copy',
    );
  }

  const existingChat = await getChatById({ id: chatId });
  if (!existingChat) {
    throw new ChatSDKError('not_found:database', 'Chat not found');
  }
  if (existingChat.userId !== ownerUserId) {
    throw new ChatSDKError('forbidden:chat', 'Only the owner can share');
  }

  const messages = await getMessagesByChatId({ id: chatId });
  const newChatId = randomUUID();

  await saveChat({
    id: newChatId,
    userId: targetUserId,
    title: existingChat.title,
    visibility: 'private',
    sharedByUserId: ownerUserId,
  });

  if (messages.length > 0) {
    const newMessages: Array<DBMessage> = messages.map((msg) => ({
      ...msg,
      id: randomUUID(),
      chatId: newChatId,
    }));
    await saveMessages({ messages: newMessages });
  }

  return newChatId;
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  if (!isDatabaseAvailable()) {
    console.log(
      '[deleteMessagesByChatIdAfterTimestamp] Database not available, skipping deletion',
    );
    return;
  }

  try {
    const messagesToDelete = await (await ensureDb())
      .select({ id: message.id })
      .from(message)
      .where(
        and(eq(message.chatId, chatId), gte(message.createdAt, timestamp)),
      );

    const messageIds = messagesToDelete.map((message) => message.id);

    if (messageIds.length > 0) {
      return await (await ensureDb())
        .delete(message)
        .where(
          and(eq(message.chatId, chatId), inArray(message.id, messageIds)),
        );
    }
  } catch (_error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to delete messages by chat id after timestamp',
    );
  }
}

export async function updateChatVisiblityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: 'private' | 'public';
}) {
  if (!isDatabaseAvailable()) {
    console.log(
      '[updateChatVisiblityById] Database not available, skipping update',
    );
    return;
  }

  try {
    return await (await ensureDb())
      .update(chat)
      .set({ visibility })
      .where(eq(chat.id, chatId));
  } catch (_error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to update chat visibility by id',
    );
  }
}

export async function updateChatTitleById({
  chatId,
  title,
}: {
  chatId: string;
  title: string;
}) {
  if (!isDatabaseAvailable()) {
    console.log(
      '[updateChatTitleById] Database not available, skipping update',
    );
    return;
  }

  const trimmed = title.trim();
  if (!trimmed) {
    throw new ChatSDKError('bad_request:api', 'Title cannot be empty');
  }

  try {
    return await (await ensureDb())
      .update(chat)
      .set({ title: trimmed })
      .where(eq(chat.id, chatId));
  } catch (_error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to update chat title by id',
    );
  }
}

export async function updateChatLastContextById({
  chatId,
  context,
}: {
  chatId: string;
  // Store raw LanguageModelUsage to keep it simple
  context: LanguageModelV3Usage;
}) {
  if (!isDatabaseAvailable()) {
    console.log(
      '[updateChatLastContextById] Database not available, skipping update',
    );
    return;
  }

  try {
    return await (await ensureDb())
      .update(chat)
      .set({ lastContext: context })
      .where(eq(chat.id, chatId));
  } catch (error) {
    console.warn('Failed to update lastContext for chat', chatId, error);
    return;
  }
}

export async function updateChatLastConfigById({
  chatId,
  persona,
  thinkingMode,
}: {
  chatId: string;
  persona: string;
  thinkingMode: string;
}) {
  if (!isDatabaseAvailable()) {
    console.log(
      '[updateChatLastConfigById] Database not available, skipping update',
    );
    return;
  }

  try {
    return await (await ensureDb())
      .update(chat)
      .set({ lastPersona: persona, lastThinkingMode: thinkingMode })
      .where(eq(chat.id, chatId));
  } catch (error) {
    console.warn(
      'Failed to update lastPersona/lastThinkingMode for chat',
      chatId,
      error,
    );
    return;
  }
}

// ---- Long-term memory (DatabricksStore / LangGraph PostgresStore) ----

function userIdToStorePrefix(userId: string): string {
  return `user_memories.${userId.replace(/\./g, '-')}`;
}

export interface StoreMemory {
  key: string;
  value: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export async function getUserMemories({
  userId,
}: {
  userId: string;
}): Promise<StoreMemory[]> {
  if (!isDatabaseAvailable()) {
    return [];
  }

  try {
    const db = await ensureDb();
    const prefix = userIdToStorePrefix(userId);
    const rows = await db.execute(
      sql`SELECT key, value, created_at, updated_at FROM public.store WHERE prefix = ${prefix} ORDER BY updated_at DESC`,
    );
    return (rows as unknown as StoreMemory[]) ?? [];
  } catch (error) {
    console.error('[getUserMemories] Error:', error);
    return [];
  }
}

export async function deleteUserMemory({
  userId,
  key,
}: {
  userId: string;
  key: string;
}) {
  if (!isDatabaseAvailable()) return;

  try {
    const db = await ensureDb();
    const prefix = userIdToStorePrefix(userId);
    await db.execute(
      sql`DELETE FROM public.store WHERE prefix = ${prefix} AND key = ${key}`,
    );
  } catch (error) {
    console.error('[deleteUserMemory] Error:', error);
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to delete user memory',
    );
  }
}

export async function deleteAllUserMemories({
  userId,
}: {
  userId: string;
}) {
  if (!isDatabaseAvailable()) return;

  try {
    const db = await ensureDb();
    const prefix = userIdToStorePrefix(userId);
    await db.execute(sql`DELETE FROM public.store WHERE prefix = ${prefix}`);
  } catch (error) {
    console.error('[deleteAllUserMemories] Error:', error);
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to delete all user memories',
    );
  }
}

// ---- User (upsert on session) ----

const USER_EMAIL_MAX_LENGTH = 64;

export async function upsertUser({
  id,
  email,
}: {
  id: string;
  email: string;
}): Promise<void> {
  if (!isDatabaseAvailable()) {
    return;
  }

  try {
    const database = await ensureDb();
    const emailTrimmed = email.slice(0, USER_EMAIL_MAX_LENGTH);

    await database
      .insert(user)
      .values({ id, email: emailTrimmed })
      .onConflictDoUpdate({
        target: user.id,
        set: { email: emailTrimmed },
      });
  } catch (error) {
    console.error('[upsertUser] Error:', error);
    // Do not throw: session still works without User row
  }
}

const USERS_LIST_DEFAULT_LIMIT = 100;

export async function getUsersByIds(
  ids: string[],
): Promise<Array<{ id: string; email: string }>> {
  if (!isDatabaseAvailable() || ids.length === 0) {
    return [];
  }

  const uniqueIds = [...new Set(ids)];
  try {
    return await (await ensureDb())
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(inArray(user.id, uniqueIds));
  } catch (error) {
    console.error('[getUsersByIds] Error:', error);
    return [];
  }
}

export async function getUsers({
  q,
  limit = USERS_LIST_DEFAULT_LIMIT,
}: {
  q?: string;
  limit?: number;
}): Promise<Array<{ id: string; email: string }>> {
  if (!isDatabaseAvailable()) {
    return [];
  }

  try {
    const database = await ensureDb();
    const baseQuery = database.select({ id: user.id, email: user.email }).from(user);

    if (q?.trim()) {
      const pattern = `%${q.trim()}%`;
      return await baseQuery
        .where(or(ilike(user.email, pattern), ilike(user.id, pattern)))
        .limit(limit);
    }

    return await baseQuery.limit(limit);
  } catch (error) {
    console.error('[getUsers] Error:', error);
    return [];
  }
}

// ---- User settings (custom instructions + response level) ----

export type UserSettingsRow = {
  customInstructions: string | null;
  responseLevel: string | null;
};

export async function getUserSettings({
  userId,
}: {
  userId: string;
}): Promise<UserSettingsRow | null> {
  if (!isDatabaseAvailable()) {
    return null;
  }

  try {
    const [result] = await (await ensureDb())
      .select({
        customInstructions: userSettings.customInstructions,
        responseLevel: userSettings.responseLevel,
      })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    return result ?? null;
  } catch (error) {
    console.warn('Failed to get user settings for user', userId, error);
    return null;
  }
}

/** @deprecated Use getUserSettings. Returns customInstructions only. */
export async function getCustomInstructions({
  userId,
}: {
  userId: string;
}): Promise<string | null> {
  const row = await getUserSettings({ userId });
  return row?.customInstructions ?? null;
}

export async function updateUserSettings({
  userId,
  customInstructions,
  responseLevel,
}: {
  userId: string;
  customInstructions?: string;
  responseLevel?: string;
}) {
  if (!isDatabaseAvailable()) {
    console.log(
      '[updateUserSettings] Database not available, skipping',
    );
    return;
  }

  try {
    const database = await ensureDb();
    const updates: Partial<Record<'customInstructions' | 'responseLevel', string>> = {};
    if (customInstructions !== undefined) updates.customInstructions = customInstructions;
    if (responseLevel !== undefined) updates.responseLevel = responseLevel;
    if (Object.keys(updates).length === 0) return;

    await database
      .insert(userSettings)
      .values({
        userId,
        customInstructions: customInstructions ?? null,
        responseLevel: responseLevel ?? null,
      })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: updates,
      });
  } catch (error) {
    console.error('Failed to update user settings:', error);
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to update user settings',
    );
  }
}

/** @deprecated Use updateUserSettings. Updates only customInstructions. */
export async function updateCustomInstructions({
  userId,
  customInstructions,
}: {
  userId: string;
  customInstructions: string;
}) {
  await updateUserSettings({ userId, customInstructions });
}
