import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getUsers, shareChatToUser, type AppUser } from '@/lib/actions';
import { Loader2 } from 'lucide-react';

export function ShareChatDialog({
  chatId,
  open,
  onOpenChange,
  onSuccess,
}: {
  chatId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (targetEmail: string) => void;
}) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<AppUser[]>([]);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didOpenRef = useRef(false);

  const loadUsers = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const { users: list } = await getUsers({
        q: query.trim() || undefined,
        limit: 50,
      });
      setUsers(list);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Impossible de charger les utilisateurs',
      );
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setSelectedUsers([]);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) {
      didOpenRef.current = false;
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = null;
      }
      return;
    }
    const justOpened = !didOpenRef.current;
    didOpenRef.current = true;
    if (justOpened) {
      loadUsers('');
      return;
    }
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      loadUsers(search);
      searchDebounceRef.current = null;
    }, 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [search, open, loadUsers]);

  const toggleUser = (u: AppUser) => {
    setSelectedUsers((prev) =>
      prev.some((x) => x.id === u.id)
        ? prev.filter((x) => x.id !== u.id)
        : [...prev, u],
    );
  };

  const handleShare = async () => {
    if (selectedUsers.length === 0) return;
    setSharing(true);
    setError(null);
    try {
      for (const u of selectedUsers) {
        await shareChatToUser({ chatId, targetUserId: u.id });
        onSuccess?.(u.email);
      }
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec du partage');
    } finally {
      setSharing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Partager la conversation</DialogTitle>
          <DialogDescription>
            Choisissez un ou plusieurs utilisateurs ayant déjà utilisé l’app.
            Une copie de la conversation sera ajoutée à leur historique.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Input
            placeholder="Rechercher par email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full"
          />
          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}
          <div className="max-h-56 overflow-y-auto rounded-md border">
            {loading ? (
              <div className="flex items-center justify-center gap-2 p-4 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Chargement…
              </div>
            ) : users.length === 0 ? (
              <p className="p-4 text-muted-foreground text-sm">
                Aucun utilisateur trouvé.
              </p>
            ) : (
              <ul className="divide-y">
                {users.map((u) => {
                  const isSelected = selectedUsers.some((x) => x.id === u.id);
                  return (
                    <li key={u.id}>
                      <button
                        type="button"
                        className="w-full px-4 py-2 text-left text-sm focus:outline-none focus:bg-accent/50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                        data-selected={isSelected ? 'true' : undefined}
                        aria-selected={isSelected}
                        onClick={() => toggleUser(u)}
                      >
                        <span className="font-medium">{u.email}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sharing}
          >
            Annuler
          </Button>
          <Button
            onClick={handleShare}
            disabled={selectedUsers.length === 0 || sharing}
          >
            {sharing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Partage…
              </>
            ) : selectedUsers.length > 1 ? (
              `Partager (${selectedUsers.length})`
            ) : (
              'Partager'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
