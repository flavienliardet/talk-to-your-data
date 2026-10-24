import { isToday, isYesterday, subMonths, subWeeks } from 'date-fns';
import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';

type ClientUser = {
  email: string;
  name?: string;
  preferredUsername?: string;
};
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { useConfig } from '@/hooks/use-config';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  useSidebar,
} from '@/components/ui/sidebar';
import type { ChatWithSharedBy } from '@/types/chat';
import { fetcher } from '@/lib/utils';
import { ChatItem } from './sidebar-history-item';
import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';
import { LoaderIcon } from 'lucide-react';

const SHARED_HISTORY_KEY = '/api/history?shared_only=true&limit=100';

export type { ChatWithSharedBy } from '@/types/chat';

type GroupedChats = {
  today: ChatWithSharedBy[];
  yesterday: ChatWithSharedBy[];
  lastWeek: ChatWithSharedBy[];
  lastMonth: ChatWithSharedBy[];
  older: ChatWithSharedBy[];
};

export interface ChatHistory {
  chats: Array<ChatWithSharedBy>;
  hasMore: boolean;
}

const PAGE_SIZE = 20;

const groupChatsByDate = (chats: ChatWithSharedBy[]): GroupedChats => {
  const now = new Date();
  const oneWeekAgo = subWeeks(now, 1);
  const oneMonthAgo = subMonths(now, 1);

  return chats.reduce(
    (groups, chat) => {
      const chatDate = new Date(chat.createdAt);

      if (isToday(chatDate)) {
        groups.today.push(chat);
      } else if (isYesterday(chatDate)) {
        groups.yesterday.push(chat);
      } else if (chatDate > oneWeekAgo) {
        groups.lastWeek.push(chat);
      } else if (chatDate > oneMonthAgo) {
        groups.lastMonth.push(chat);
      } else {
        groups.older.push(chat);
      }

      return groups;
    },
    {
      today: [],
      yesterday: [],
      lastWeek: [],
      lastMonth: [],
      older: [],
    } as GroupedChats,
  );
};

export function getChatHistoryPaginationKey(
  pageIndex: number,
  previousPageData: ChatHistory,
) {
  if (previousPageData && previousPageData.hasMore === false) {
    return null;
  }

  if (pageIndex === 0) return `/api/history?limit=${PAGE_SIZE}`;

  const firstChatFromPage = previousPageData.chats.at(-1);

  if (!firstChatFromPage) return null;

  return `/api/history?ending_before=${firstChatFromPage.id}&limit=${PAGE_SIZE}`;
}

export function SidebarHistory({ user }: { user?: ClientUser | null }) {
  const { setOpenMobile } = useSidebar();
  const { id } = useParams();
  const { chatHistoryEnabled } = useConfig();

  const {
    data: paginatedChatHistories,
    setSize,
    isValidating,
    isLoading,
    mutate,
  } = useSWRInfinite<ChatHistory>(getChatHistoryPaginationKey, fetcher, {
    fallbackData: [],
  });

  const { data: sharedHistory, mutate: mutateShared } = useSWR<ChatHistory>(
    chatHistoryEnabled ? SHARED_HISTORY_KEY : null,
    fetcher,
  );

  const sharedChatsFromApi: ChatWithSharedBy[] = sharedHistory?.chats ?? [];

  const navigate = useNavigate();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [historyTab, setHistoryTab] = useState<'own' | 'shared'>('own');

  const hasReachedEnd = paginatedChatHistories
    ? paginatedChatHistories.some((page) => page.hasMore === false)
    : false;

  const hasEmptyChatHistory = paginatedChatHistories
    ? paginatedChatHistories.every((page) => page.chats.length === 0)
    : false;

  const handleDelete = async () => {
    const deletePromise = fetch(`/api/chat/${deleteId}`, {
      method: 'DELETE',
    });

    // // Emit event immediately to disable the chat UI
    // window.dispatchEvent(
    //   new CustomEvent('chat-deleted', { detail: { chatId: deleteId } })
    // );

    toast.promise(deletePromise, {
      loading: 'Suppression de la conversation...',
      success: () => {
        mutate((chatHistories) => {
          if (chatHistories) {
            return chatHistories.map((chatHistory) => ({
              ...chatHistory,
              chats: chatHistory.chats.filter((chat) => chat.id !== deleteId),
            }));
          }
        });
        mutateShared();

        return 'Conversation supprimée avec succès';
      },
      error: 'Échec de la suppression de la conversation',
    });

    setShowDeleteDialog(false);

    // Test if window.location.pathname is /chat/${id}
    // This will be true for new chats that were just created
    if (window.location.pathname === `/chat/${deleteId}`) {
      navigate('/');
    }

    if (deleteId === id) {
      navigate('/');
    }
  };

  if (!user) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <div className="flex w-full flex-row items-center justify-center gap-2 px-2 text-sm text-zinc-500">
            Connectez-vous pour sauvegarder et retrouver vos conversations !
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (isLoading) {
    return (
      <SidebarGroup>
        <div className="px-2 py-1 text-sidebar-foreground/50 text-xs">
          Aujourd'hui
        </div>
        <SidebarGroupContent>
          <div className="flex flex-col">
            {[44, 32, 28, 64, 52].map((item) => (
              <div
                key={item}
                className="flex h-8 items-center gap-2 rounded-md px-2"
              >
                <div
                  className="h-4 max-w-(--skeleton-width) flex-1 rounded-md bg-sidebar-accent-foreground/10"
                  style={
                    {
                      '--skeleton-width': `${item}%`,
                    } as React.CSSProperties
                  }
                />
              </div>
            ))}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  const hasNoSharedChats =
    sharedHistory !== undefined && sharedChatsFromApi.length === 0;
  if (hasEmptyChatHistory && hasNoSharedChats) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <div className="flex w-full flex-row items-center justify-center gap-2 px-2 text-sm text-zinc-500">
            {chatHistoryEnabled
              ? 'Vos conversations apparaîtront ici une fois que vous commencerez à discuter !'
              : "L'historique est désactivé - les conversations ne sont pas sauvegardées"}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <>
      <SidebarGroup className="flex h-full min-h-0 flex-col">
        <SidebarGroupContent className="flex min-h-0 flex-1 flex-col">
          {paginatedChatHistories &&
            (() => {
              const chatsFromHistory = paginatedChatHistories.flatMap(
                (paginatedChatHistory) => paginatedChatHistory.chats,
              );

              const ownChats = chatsFromHistory.filter(
                (c) => !c.sharedByUserId && !c.sharedBy,
              );
              const groupedOwn = groupChatsByDate(ownChats);

              const renderChatList = (
                chats: ChatWithSharedBy[],
                onRename?: () => void,
              ) =>
                chats.map((chat) => (
                  <ChatItem
                    key={chat.id}
                    chat={chat}
                    isActive={chat.id === id}
                    onDelete={(chatId) => {
                      setDeleteId(chatId);
                      setShowDeleteDialog(true);
                    }}
                    setOpenMobile={setOpenMobile}
                    onRenameSuccess={onRename ?? (() => mutate())}
                  />
                ));

              const ownChatsSection = (
                <SidebarMenu className="flex flex-col gap-6">
                  {groupedOwn.today.length > 0 && (
                    <div>
                      <div className="px-2 py-1 text-sidebar-foreground/50 text-xs">
                        Aujourd'hui
                      </div>
                      {renderChatList(groupedOwn.today)}
                    </div>
                  )}

                  {groupedOwn.yesterday.length > 0 && (
                    <div>
                      <div className="px-2 py-1 text-sidebar-foreground/50 text-xs">
                        Hier
                      </div>
                      {renderChatList(groupedOwn.yesterday)}
                    </div>
                  )}

                  {groupedOwn.lastWeek.length > 0 && (
                    <div>
                      <div className="px-2 py-1 text-sidebar-foreground/50 text-xs">
                        7 derniers jours
                      </div>
                      {renderChatList(groupedOwn.lastWeek)}
                    </div>
                  )}

                  {groupedOwn.lastMonth.length > 0 && (
                    <div>
                      <div className="px-2 py-1 text-sidebar-foreground/50 text-xs">
                        30 derniers jours
                      </div>
                      {renderChatList(groupedOwn.lastMonth)}
                    </div>
                  )}

                  {groupedOwn.older.length > 0 && (
                    <div>
                      <div className="px-2 py-1 text-sidebar-foreground/50 text-xs">
                        Plus ancien
                      </div>
                      {renderChatList(groupedOwn.older)}
                    </div>
                  )}
                </SidebarMenu>
              );

              if (sharedChatsFromApi.length > 0) {
                return (
                  <div className="flex min-h-0 flex-1 flex-col">
                    <div className="mb-2 flex shrink-0 gap-1 rounded-md p-1">
                      <button
                        type="button"
                        onClick={() => setHistoryTab('own')}
                        className={
                          historyTab === 'own'
                            ? 'rounded bg-sidebar-accent px-2.5 py-1.5 text-sidebar-accent-foreground text-xs font-medium'
                            : 'rounded px-2.5 py-1.5 text-sidebar-foreground/60 text-xs hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                        }
                      >
                        Vos chats
                      </button>
                      <button
                        type="button"
                        onClick={() => setHistoryTab('shared')}
                        className={
                          historyTab === 'shared'
                            ? 'rounded bg-sidebar-accent px-2.5 py-1.5 text-sidebar-accent-foreground text-xs font-medium'
                            : 'rounded px-2.5 py-1.5 text-sidebar-foreground/60 text-xs hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                        }
                      >
                        Chats partagés
                      </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                      {historyTab === 'own' ? (
                        <>
                          {ownChatsSection}
                          <motion.div
                            onViewportEnter={() => {
                              if (!isValidating && !hasReachedEnd) {
                                setSize((size) => size + 1);
                              }
                            }}
                          />
                          {hasReachedEnd ? (
                            <div className="mt-8 flex w-full flex-row items-center justify-center gap-2 px-2 text-sm text-zinc-500">
                              Vous avez atteint la fin de votre historique de
                              conversations.
                            </div>
                          ) : (
                            <div className="mt-8 flex flex-row items-center gap-2 p-2 text-zinc-500 dark:text-zinc-400">
                              <div className="animate-spin">
                                <LoaderIcon />
                              </div>
                              <div>Chargement des conversations...</div>
                            </div>
                          )}
                        </>
                      ) : (
                        <SidebarMenu>
                          {renderChatList(sharedChatsFromApi, () => {
                            mutate();
                            mutateShared();
                          })}
                        </SidebarMenu>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div className="flex flex-col">
                  <SidebarMenu className="flex flex-col gap-6">
                    {groupedOwn.today.length > 0 && (
                      <div>
                        <div className="px-2 py-1 text-sidebar-foreground/50 text-xs">
                          Aujourd'hui
                        </div>
                        {renderChatList(groupedOwn.today)}
                      </div>
                    )}

                    {groupedOwn.yesterday.length > 0 && (
                      <div>
                        <div className="px-2 py-1 text-sidebar-foreground/50 text-xs">
                          Hier
                        </div>
                        {renderChatList(groupedOwn.yesterday)}
                      </div>
                    )}

                    {groupedOwn.lastWeek.length > 0 && (
                      <div>
                        <div className="px-2 py-1 text-sidebar-foreground/50 text-xs">
                          7 derniers jours
                        </div>
                        {renderChatList(groupedOwn.lastWeek)}
                      </div>
                    )}

                    {groupedOwn.lastMonth.length > 0 && (
                      <div>
                        <div className="px-2 py-1 text-sidebar-foreground/50 text-xs">
                          30 derniers jours
                        </div>
                        {renderChatList(groupedOwn.lastMonth)}
                      </div>
                    )}

                    {groupedOwn.older.length > 0 && (
                      <div>
                        <div className="px-2 py-1 text-sidebar-foreground/50 text-xs">
                          Plus ancien
                        </div>
                        {renderChatList(groupedOwn.older)}
                      </div>
                    )}
                  </SidebarMenu>

                  <motion.div
                    onViewportEnter={() => {
                      if (!isValidating && !hasReachedEnd) {
                        setSize((size) => size + 1);
                      }
                    }}
                  />

                  {hasReachedEnd ? (
                    <div className="mt-8 flex w-full flex-row items-center justify-center gap-2 px-2 text-sm text-zinc-500">
                      Vous avez atteint la fin de votre historique de
                      conversations.
                    </div>
                  ) : (
                    <div className="mt-8 flex flex-row items-center gap-2 p-2 text-zinc-500 dark:text-zinc-400">
                      <div className="animate-spin">
                        <LoaderIcon />
                      </div>
                      <div>Chargement des conversations...</div>
                    </div>
                  )}
                </div>
              );
            })()}
        </SidebarGroupContent>
      </SidebarGroup>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Êtes-vous sûr(e) ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Cette conversation sera
              définitivement supprimée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Continuer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
