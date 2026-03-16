import { PreviewMessage, AwaitingResponseMessage } from './message';
import { Greeting } from './greeting';
import { memo, useEffect } from 'react';
import equal from 'fast-deep-equal';
import type { UseChatHelpers } from '@ai-sdk/react';
import { useMessages } from '@/hooks/use-messages';
import type { ChatMessage, GraphStepData } from '@chat-template/core';
import { useDataStream } from './data-stream-provider';
import { Conversation, ConversationContent } from './elements/conversation';
import { ArrowDownIcon } from 'lucide-react';

interface MessagesProps {
  chatId: string;
  status: UseChatHelpers<ChatMessage>['status'];
  messages: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>['setMessages'];
  addToolApprovalResponse: UseChatHelpers<ChatMessage>['addToolApprovalResponse'];
  sendMessage: UseChatHelpers<ChatMessage>['sendMessage'];
  regenerate: UseChatHelpers<ChatMessage>['regenerate'];
  isReadonly: boolean;
  selectedModelId: string;
  graphSteps: GraphStepData[];
  bottomStep: GraphStepData | null;
}

function PureMessages({
  chatId,
  status,
  messages,
  setMessages,
  addToolApprovalResponse,
  sendMessage,
  regenerate,
  isReadonly,
  selectedModelId,
  graphSteps,
  bottomStep,
}: MessagesProps) {
  const {
    containerRef: messagesContainerRef,
    endRef: messagesEndRef,
    isAtBottom,
    scrollToBottom,
    hasSentMessage,
  } = useMessages({
    status,
  });

  useDataStream();

  useEffect(() => {
    if (status === 'submitted') {
      requestAnimationFrame(() => {
        const container = messagesContainerRef.current;
        if (container) {
          container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth',
          });
        }
      });
    }
  }, [status, messagesContainerRef]);

  return (
    <div
      ref={messagesContainerRef}
      className="overscroll-behavior-contain -webkit-overflow-scrolling-touch flex-1 touch-pan-y overflow-y-scroll"
      style={{ overflowAnchor: 'none' }}
    >
      <Conversation className="mx-auto flex min-w-0 max-w-4xl flex-col gap-4 md:gap-6">
        <ConversationContent className="flex flex-col gap-4 px-2 py-4 md:gap-6 md:px-4">
          {messages.length === 0 && <Greeting />}

          {messages.map((message, index) => {
            const isLast = messages.length - 1 === index;
            const isLastStreaming = status === 'streaming' && isLast;

            const hasNoTextContent =
              !message.parts?.length ||
              message.parts.every((p) => p.type === 'data-graph-step');

            if (
              isLast &&
              message.role === 'assistant' &&
              (status === 'submitted' ||
                (isLastStreaming && graphSteps.length > 0 && bottomStep == null) ||
                (isLastStreaming && hasNoTextContent))
            ) {
              return null;
            }

            return (
              <PreviewMessage
                key={message.id}
                chatId={chatId}
                message={message}
                allMessages={messages}
                isLoading={isLastStreaming}
                setMessages={setMessages}
                addToolApprovalResponse={addToolApprovalResponse}
                sendMessage={sendMessage}
                regenerate={regenerate}
                isReadonly={isReadonly}
                requiresScrollPadding={
                  hasSentMessage && isLast
                }
                bottomStep={isLast && isLastStreaming ? bottomStep : null}
              />
            );
          })}

          {(() => {
            const lastMsg = messages[messages.length - 1];
            const lastAssistantEmpty =
              lastMsg?.role === 'assistant' &&
              (!lastMsg.parts?.length ||
                lastMsg.parts.every((p) => p.type === 'data-graph-step'));

            const showAwaiting =
              (status === 'submitted' ||
                (status === 'streaming' && graphSteps.length > 0) ||
                (status === 'streaming' && lastAssistantEmpty)) &&
              bottomStep == null &&
              selectedModelId !== 'chat-model-reasoning';

            return showAwaiting ? (
              <AwaitingResponseMessage graphSteps={graphSteps} />
            ) : null;
          })()}

          <div
            ref={messagesEndRef}
            className="min-h-[24px] min-w-[24px] shrink-0"
          />
        </ConversationContent>
      </Conversation>

      {!isAtBottom && (
        <button
          className="-translate-x-1/2 absolute bottom-40 left-1/2 z-10 rounded-full border bg-background p-2 shadow-lg transition-colors hover:bg-muted"
          onClick={() => scrollToBottom('smooth')}
          type="button"
          aria-label="Scroll to bottom"
        >
          <ArrowDownIcon className="size-4" />
        </button>
      )}
    </div>
  );
}

export const Messages = memo(PureMessages, (prevProps, nextProps) => {
  if (prevProps.status !== nextProps.status) return false;
  if (prevProps.selectedModelId !== nextProps.selectedModelId) return false;
  if (prevProps.messages.length !== nextProps.messages.length) return false;
  if (!equal(prevProps.messages, nextProps.messages)) return false;
  if (prevProps.graphSteps.length !== nextProps.graphSteps.length) return false;
  if (prevProps.bottomStep?.node !== nextProps.bottomStep?.node) return false;
  if (prevProps.bottomStep?.label !== nextProps.bottomStep?.label) return false;

  return false;
});
