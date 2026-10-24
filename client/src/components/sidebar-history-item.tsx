import type { ChatWithSharedBy } from '@/types/chat';
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from './ui/sidebar';
import { Link } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { memo, useRef, useState } from 'react';
import { useChatVisibility } from '@/hooks/use-chat-visibility';
import {
  CircleCheck,
  GlobeIcon,
  LockIcon,
  MoreHorizontalIcon,
  ScanEye,
  TrashIcon,
  UserPlusIcon,
} from 'lucide-react';
import { ShareChatDialog } from '@/components/share-chat-dialog';
import { toast } from 'sonner';
import { updateChatTitle } from '@/lib/actions';
import { cn } from '@/lib/utils';

const PureChatItem = ({
  chat,
  isActive,
  onDelete,
  setOpenMobile,
  onRenameSuccess,
}: {
  chat: ChatWithSharedBy;
  isActive: boolean;
  onDelete: (chatId: string) => void;
  setOpenMobile: (open: boolean) => void;
  onRenameSuccess?: () => void;
}) => {
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState(chat.title);
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { visibilityType, setVisibilityType } = useChatVisibility({
    chatId: chat.id,
    initialVisibilityType: chat.visibility,
  });

  const isOwnChat = chat.sharedBy == null && chat.sharedByUserId == null;

  const startEditingTitle = (e: React.MouseEvent) => {
    if (!isOwnChat) return;
    e.preventDefault();
    e.stopPropagation();
    setEditTitleValue(chat.title);
    setIsEditingTitle(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const saveTitle = async () => {
    if (!isOwnChat || !editTitleValue.trim() || editTitleValue === chat.title) {
      setIsEditingTitle(false);
      return;
    }
    setIsSavingTitle(true);
    try {
      await updateChatTitle({ chatId: chat.id, title: editTitleValue.trim() });
      toast.success('Conversation renommée');
      onRenameSuccess?.();
    } catch {
      toast.error('Impossible de renommer la conversation');
    } finally {
      setIsSavingTitle(false);
      setIsEditingTitle(false);
    }
  };

  const cancelEditTitle = () => {
    setEditTitleValue(chat.title);
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void saveTitle();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditTitle();
      inputRef.current?.blur();
    }
  };

  return (
    <SidebarMenuItem data-testid="chat-history-item">
      <SidebarMenuButton
        asChild={!isEditingTitle}
        isActive={isActive}
        className="h-auto min-h-8 py-2"
      >
        {isEditingTitle ? (
          <div
            className="flex min-w-0 flex-1 flex-col items-stretch gap-0 leading-tight"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              type="text"
              value={editTitleValue}
              onChange={(e) => setEditTitleValue(e.target.value)}
              onBlur={() => void saveTitle()}
              onKeyDown={handleTitleKeyDown}
              disabled={isSavingTitle}
              className={cn(
                'w-full min-w-0 rounded border border-sidebar-ring bg-sidebar-accent/30 px-2 py-1',
                'text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/50',
                'focus:border-sidebar-ring focus:ring-1 focus:ring-sidebar-ring',
              )}
              placeholder="Titre de la conversation"
              data-testid="chat-rename-input"
            />
          </div>
        ) : (
          <Link
            to={`/chat/${chat.id}`}
            onClick={() => setOpenMobile(false)}
            className="flex flex-col items-start gap-0 leading-snug"
          >
            <span
              role="button"
              tabIndex={isOwnChat ? 0 : undefined}
              onClick={(e) => {
                if (isOwnChat && e.detail === 2) {
                  e.preventDefault();
                  e.stopPropagation();
                  startEditingTitle(e);
                }
              }}
              onKeyDown={(e) => {
                if (isOwnChat && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  startEditingTitle(e as unknown as React.MouseEvent);
                }
              }}
              className={cn(
                isOwnChat &&
                  'rounded px-0.5 py-0.5 -mx-0.5 focus:outline-none focus:ring-1 focus:ring-sidebar-ring focus:ring-inset',
              )}
              title={isOwnChat ? 'Double-cliquer pour renommer' : undefined}
            >
              {chat.title}
            </span>
            {(chat.sharedBy != null || chat.sharedByUserId != null) && (
              <span className="mt-px text-sidebar-foreground/60 text-[11px] font-normal leading-tight">
                Partagé par {chat.sharedBy?.email ?? String(chat.sharedByUserId ?? '')}
              </span>
            )}
          </Link>
        )}
      </SidebarMenuButton>

      <DropdownMenu modal={true}>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction
            data-testid="chat-options"
            className="mr-0.5 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            showOnHover={!isActive}
          >
            <MoreHorizontalIcon />
            <span className="sr-only">Plus</span>
          </SidebarMenuAction>
        </DropdownMenuTrigger>

        <DropdownMenuContent side="bottom" align="end">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer">
              <ScanEye  />
              <span>Visibilité</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  className="cursor-pointer flex-row justify-between"
                  onClick={() => {
                    setVisibilityType('private');
                  }}
                >
                  <div className="flex flex-row items-center gap-2">
                    <LockIcon size={12} />
                    <span>Privé</span>
                  </div>
                  {visibilityType === 'private' ? <CircleCheck /> : null}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer flex-row justify-between"
                  onClick={() => {
                    setVisibilityType('public');
                  }}
                >
                  <div className="flex flex-row items-center gap-2">
                    <GlobeIcon />
                    <span>Public</span>
                  </div>
                  {visibilityType === 'public' ? <CircleCheck /> : null}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          <DropdownMenuItem
            className="cursor-pointer"
            onSelect={() => setShareDialogOpen(true)}
          >
            <UserPlusIcon />
            <span>Partager avec…</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            className="cursor-pointer text-destructive focus:bg-destructive/15 focus:text-destructive dark:text-red-500"
            onSelect={() => onDelete(chat.id)}
          >
            <TrashIcon />
            <span>Supprimer</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ShareChatDialog
        chatId={chat.id}
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        onSuccess={(email) => {
          toast.success(`Conversation partagée avec ${email}`);
        }}
      />
    </SidebarMenuItem>
  );
};

export const ChatItem = memo(PureChatItem, (prevProps, nextProps) => {
  if (prevProps.isActive !== nextProps.isActive) return false;
  if (prevProps.chat.id !== nextProps.chat.id) return false;
  if (prevProps.chat.title !== nextProps.chat.title) return false;
  return true;
});
