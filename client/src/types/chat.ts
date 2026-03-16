import type { Chat } from '@chat-template/db';

export type ChatWithSharedBy = Chat & {
  sharedBy?: { id: string; email: string };
};
