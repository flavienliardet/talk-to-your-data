import { motion } from 'framer-motion';
import { memo } from 'react';
import type { UseChatHelpers } from '@ai-sdk/react';
import type { ChatMessage, VisibilityType } from '@chat-template/core';
import { Suggestion } from './elements/suggestion';
import { softNavigateToChatId } from '@/lib/navigation';
import { useAppConfig } from '@/contexts/AppConfigContext';

const MAX_SUGGESTIONS_DISPLAYED = 3;
const EXPLORATORY_QUESTION = 'Quelles sont les données auxquelles tu as accès ?';

const SUGGESTIONS_BY_PERSONA: Record<
  'Stock' | 'Cdistrib',
  readonly string[]
> = {
  Stock: [
    EXPLORATORY_QUESTION,
    'Quelle est la dernière date de stock disponible ?',
  ],
  Cdistrib: [
    EXPLORATORY_QUESTION,
    'Quels SKU / familles génèrent le plus de délais ?',
  ],
};

interface SuggestedActionsProps {
  chatId: string;
  sendMessage: UseChatHelpers<ChatMessage>['sendMessage'];
  selectedVisibilityType: VisibilityType;
  persona: 'Stock' | 'Cdistrib';
  /** When set, show these follow-up suggestions (e.g. from Genie) instead of the default persona suggestions. */
  dynamicSuggestions?: string[];
}

function PureSuggestedActions({
  chatId,
  sendMessage,
  persona,
  dynamicSuggestions,
}: SuggestedActionsProps) {
  const { chatHistoryEnabled } = useAppConfig();
  const suggestedActions =
    dynamicSuggestions && dynamicSuggestions.length > 0
      ? dynamicSuggestions
      : SUGGESTIONS_BY_PERSONA[persona];
  const displayed = suggestedActions.slice(0, MAX_SUGGESTIONS_DISPLAYED);

  return (
    <div
      data-testid="suggested-actions"
      className="flex w-full gap-2 overflow-x-auto overflow-y-hidden pb-1"
    >
      {displayed.map((suggestedAction, index) => (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ delay: 0.05 * index }}
          key={suggestedAction}
          className="flex-shrink-0 min-w-0 max-w-[min(100%,20rem)]"
        >
          <Suggestion
            suggestion={suggestedAction}
            onClick={(suggestion) => {
              softNavigateToChatId(chatId, chatHistoryEnabled);
              sendMessage({
                role: 'user',
                parts: [{ type: 'text', text: suggestion }],
              });
            }}
            variant="ghost"
            className="h-auto w-full justify-start whitespace-normal rounded-full border border-accent/40 bg-accent/20 px-3 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-accent/35 hover:border-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
          >
            {suggestedAction}
          </Suggestion>
        </motion.div>
      ))}
    </div>
  );
}

export const SuggestedActions = memo(
  PureSuggestedActions,
  (prevProps, nextProps) => {
    if (prevProps.chatId !== nextProps.chatId) return false;
    if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType)
      return false;
    if (prevProps.persona !== nextProps.persona) return false;
    if (
      (prevProps.dynamicSuggestions?.length ?? 0) !==
      (nextProps.dynamicSuggestions?.length ?? 0)
    )
      return false;
    if (
      prevProps.dynamicSuggestions?.some(
        (q, i) => nextProps.dynamicSuggestions?.[i] !== q,
      )
    )
      return false;

    return true;
  },
);
