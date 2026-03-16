import { fetchWithErrorHandlers } from './utils';
import type { VisibilityType } from '@chat-template/core';

export type AppUser = { id: string; email: string };

/**
 * List users (option A: from app User table)
 */
export async function getUsers({
  q,
  limit,
}: {
  q?: string;
  limit?: number;
}): Promise<{ users: AppUser[] }> {
  const params = new URLSearchParams();
  if (q?.trim()) params.set('q', q.trim());
  if (limit != null) params.set('limit', String(limit));
  const url = `/api/users${params.toString() ? `?${params}` : ''}`;
  const response = await fetchWithErrorHandlers(url, { credentials: 'include' });
  return response.json();
}

/**
 * Share (copy) chat to another user
 */
export async function shareChatToUser({
  chatId,
  targetUserId,
}: {
  chatId: string;
  targetUserId: string;
}): Promise<{ newChatId: string }> {
  const response = await fetchWithErrorHandlers(
    `/api/chat/${chatId}/share`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ targetUserId }),
    },
  );
  return response.json();
}

/**
 * Update chat title
 */
export async function updateChatTitle({
  chatId,
  title,
}: {
  chatId: string;
  title: string;
}): Promise<{ success: boolean; title: string }> {
  const response = await fetchWithErrorHandlers(
    `/api/chat/${chatId}/title`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ title: title.trim() }),
    },
  );

  return response.json();
}

/**
 * Update chat visibility (public/private)
 */
export async function updateChatVisibility({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: VisibilityType;
}) {
  const response = await fetchWithErrorHandlers(
    `/api/chat/${chatId}/visibility`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ visibility }),
    },
  );

  return response.json();
}

/**
 * Delete messages after a certain timestamp
 */
export async function deleteTrailingMessages({
  messageId,
}: {
  messageId: string;
}) {
  const response = await fetchWithErrorHandlers(
    `/api/messages/${messageId}/trailing`,
    {
      method: 'DELETE',
      credentials: 'include',
    },
  );

  if (response.status === 204) {
    return null;
  }

  return response.json();
}
