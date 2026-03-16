import { useState } from 'react';
import {
  BarChart2,
  Brain,
  ChevronDown,
  ChevronUp,
  LoaderIcon,
  Settings,
  Trash2,
} from 'lucide-react';
import { useTheme } from 'next-themes';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useSession } from '@/contexts/SessionContext';
import { useCustomInstructions } from '@/contexts/CustomInstructionsContext';
import { toast } from '@/components/toast';
import { useUserMemories, type Memory } from '@/hooks/use-user-memories';
import type { ClientSession } from '@chat-template/auth';
import type { ResponseLevel } from '@chat-template/core';

const RESPONSE_LEVEL_OPTIONS: Array<{ value: ResponseLevel; label: string }> = [
  { value: 'exploratoire', label: 'Exploratoire' },
  { value: 'statistique', label: 'Statistique' },
];

function MemoryItem({
  memory,
  onDelete,
}: {
  memory: Memory;
  onDelete: (key: string) => void;
}) {
  const fact =
    typeof memory.value === 'object' && memory.value !== null
      ? ((memory.value as Record<string, unknown>).fact ??
        JSON.stringify(memory.value))
      : String(memory.value);

  return (
    <div className="group flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm">{memory.key.replace(/_/g, ' ')}</p>
        <p className="mt-0.5 text-muted-foreground text-sm">{String(fact)}</p>
      </div>
      <button
        type="button"
        onClick={() => onDelete(memory.key)}
        className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
        title="Supprimer"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function SettingsSection({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-t-lg bg-muted/50 p-3 text-left font-medium text-sm transition-colors hover:bg-muted"
      >
        {icon}
        <span className="flex-1">{title}</span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && <div className="border-t px-3 pt-2 pb-3">{children}</div>}
    </div>
  );
}

export function SidebarUserNav({
  user,
  preferredUsername,
}: {
  user: ClientSession['user'];
  preferredUsername: string | null;
}) {
  const { session, loading } = useSession();
  const data = session;
  const status = loading
    ? 'loading'
    : session
      ? 'authenticated'
      : 'unauthenticated';
  const { setTheme, resolvedTheme } = useTheme();
  const {
    customInstructions,
    setCustomInstructions,
    responseLevel,
    setResponseLevel,
    saveInstructions,
    saveResponseLevel,
    savingInstructions,
    savingResponseLevel,
  } = useCustomInstructions();

  const [sheetOpen, setSheetOpen] = useState(false);
  const {
    memories,
    loading: memoriesLoading,
    fetchMemories,
    deleteMemory,
    deleteAll,
  } = useUserMemories();

  const displayName =
    preferredUsername || data?.user?.name || user?.email || 'User';

  const handleOpenSettings = () => {
    setSheetOpen(true);
    fetchMemories();
  };

  const handleDeleteMemory = async (key: string) => {
    await deleteMemory(key);
    toast({ type: 'success', description: 'Souvenir supprimé.' });
  };

  const handleDeleteAll = async () => {
    await deleteAll();
    toast({
      type: 'success',
      description: 'Tous les souvenirs ont été supprimés.',
    });
  };

  const handleSaveInstructions = async () => {
    await saveInstructions();
    toast({ type: 'success', description: 'Instructions enregistrées.' });
  };

  const handleSaveResponseLevel = async () => {
    await saveResponseLevel();
    toast({ type: 'success', description: 'Niveau de réponse enregistré.' });
  };

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {status === 'loading' ? (
                <SidebarMenuButton className="h-10 justify-between bg-background data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                  <div className="flex flex-row gap-2">
                    <div className="size-6 animate-pulse rounded-full bg-zinc-500/30" />
                    <span className="animate-pulse rounded-md bg-zinc-500/30 text-transparent">
                      Chargement...
                    </span>
                  </div>
                  <div className="animate-spin text-zinc-500">
                    <LoaderIcon />
                  </div>
                </SidebarMenuButton>
              ) : (
                <SidebarMenuButton
                  data-testid="user-nav-button"
                  className="h-10 bg-background data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <div className="flex size-6 items-center justify-center rounded-full bg-foreground font-medium text-background text-xs">
                    {displayName.charAt(0)}
                  </div>
                  <span data-testid="user-email" className="truncate">
                    {displayName}
                  </span>
                  <ChevronUp className="ml-auto" />
                </SidebarMenuButton>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent
              data-testid="user-nav-menu"
              side="top"
              className="w-(--radix-popper-anchor-width)"
            >
              <DropdownMenuItem
                className="cursor-pointer"
                onSelect={handleOpenSettings}
              >
                <Settings className="mr-2 h-4 w-4" />
                Paramètres
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                data-testid="user-nav-item-theme"
                className="cursor-pointer"
                onSelect={() =>
                  setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
                }
              >
                {resolvedTheme === 'light'
                  ? 'Passer en mode sombre'
                  : 'Passer en mode clair'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="left" className="flex w-full flex-col sm:max-w-md">
          <SheetTitle>Paramètres</SheetTitle>

          <div className="mt-4 flex flex-1 flex-col gap-3 overflow-y-auto">
            {false && (
              <SettingsSection
                title="Niveau de réponse"
                icon={<BarChart2 className="h-4 w-4" />}
                defaultOpen
              >
                <p className="mb-2 text-muted-foreground text-sm">
                  Choisissez le niveau d&apos;analyse : Exploratoire (défaut) ou
                  Statistique (analyses poussées).
                </p>
                <div
                  role="group"
                  aria-label="Niveau de réponse"
                  className="flex w-full rounded-lg border border-input bg-muted/30 p-0.5"
                >
                  {RESPONSE_LEVEL_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setResponseLevel(opt.value)}
                      className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none ${
                        responseLevel === opt.value
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground/80'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex justify-end">
                  <Button
                    onClick={handleSaveResponseLevel}
                    disabled={savingResponseLevel}
                    size="sm"
                  >
                    {savingResponseLevel ? 'Enregistrement…' : 'Enregistrer'}
                  </Button>
                </div>
              </SettingsSection>
            )}

            <SettingsSection
              title="Instructions personnalisées"
              icon={<Settings className="h-4 w-4" />}
            >
              <p className="mb-2 text-muted-foreground text-sm">
                Définissez le style, le ton et le comportement des réponses de
                l'assistant. Ces instructions s'appliquent à toutes vos
                conversations.
              </p>
              <Textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="Ex. : Réponds en 2 phrases max. Ton professionnel. Pas d'emoji."
                className="min-h-[200px] resize-none"
              />
              <div className="mt-3 flex justify-end">
                <Button
                  onClick={handleSaveInstructions}
                  disabled={savingInstructions}
                  size="sm"
                >
                  {savingInstructions ? 'Enregistrement…' : 'Enregistrer'}
                </Button>
              </div>
            </SettingsSection>

            <SettingsSection
              title="Mes informations enregistrées"
              icon={<Brain className="h-4 w-4" />}
            >
              <p className="mb-3 text-muted-foreground text-sm">
                Ce que l'assistant a retenu sur vous et votre façon de travailler avec la donnée. Ces informations permettent de personnifier l'expérience utilisateur.
              </p>

              {memoriesLoading ? (
                <div className="flex items-center justify-center py-6">
                  <LoaderIcon className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-muted-foreground text-sm">
                    Chargement...
                  </span>
                </div>
              ) : memories.length === 0 ? (
                <div className="py-6 text-center text-muted-foreground text-sm">
                  Aucun souvenir enregistré.
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    {memories.map((memory) => (
                      <MemoryItem
                        key={memory.key}
                        memory={memory}
                        onDelete={handleDeleteMemory}
                      />
                    ))}
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDeleteAll}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Tout supprimer
                    </Button>
                  </div>
                </>
              )}
            </SettingsSection>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
