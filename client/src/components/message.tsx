import { AnimatePresence, motion } from 'framer-motion';
import React, { memo, useState } from 'react';
import { AnimatedAssistantIcon } from './animation-assistant-icon';
import { Response } from './elements/response';
import { MessageContent } from './elements/message';
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
  type ToolState,
} from './elements/tool';
import {
  McpTool,
  McpToolHeader,
  McpToolContent,
  McpToolInput,
  McpApprovalActions,
} from './elements/mcp-tool';
import { MessageActions } from './message-actions';
import { PreviewAttachment } from './preview-attachment';
import equal from 'fast-deep-equal';
import { cn, sanitizeText } from '@/lib/utils';
import { MessageEditor } from './message-editor';
import { MessageReasoning } from './message-reasoning';
import type { UseChatHelpers } from '@ai-sdk/react';
import type { ChatMessage, GraphStepData } from '@chat-template/core';
import { useDataStream } from './data-stream-provider';
import {
  createMessagePartSegments,
  extractGenieTable,
  formatNamePart,
  getGenieZone,
  isGenieTablePart,
  isNamePart,
  isSqlPart,
  isTablePart,
  pairSqlWithTables,
  joinMessagePartSegments,
} from './databricks-message-part-transformers';
import { GenieResultBlock } from './genie-result-block';
import { GenieZoneWrapper } from './genie-zone-wrapper';
import { MessageError } from './message-error';
import { MessageOAuthError } from './message-oauth-error';
import { isCredentialErrorMessage } from '@/lib/oauth-error-utils';
import { Streamdown } from 'streamdown';
import { useApproval } from '@/hooks/use-approval';

const PurePreviewMessage = ({
  message,
  allMessages,
  isLoading,
  setMessages,
  addToolApprovalResponse,
  sendMessage,
  regenerate,
  isReadonly,
  requiresScrollPadding,
  bottomStep,
}: {
  chatId: string;
  message: ChatMessage;
  allMessages: ChatMessage[];
  isLoading: boolean;
  setMessages: UseChatHelpers<ChatMessage>['setMessages'];
  addToolApprovalResponse: UseChatHelpers<ChatMessage>['addToolApprovalResponse'];
  sendMessage: UseChatHelpers<ChatMessage>['sendMessage'];
  regenerate: UseChatHelpers<ChatMessage>['regenerate'];
  isReadonly: boolean;
  requiresScrollPadding: boolean;
  bottomStep?: GraphStepData | null;
}) => {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [showErrors, setShowErrors] = useState(false);

  // Hook for handling MCP approval requests
  const { submitApproval, isSubmitting, pendingApprovalId } = useApproval({
    addToolApprovalResponse,
    sendMessage,
  });

  const attachmentsFromMessage = message.parts.filter(
    (part) => part.type === 'file',
  );

  // Extract non-OAuth error parts separately (OAuth errors are rendered inline)
  const errorParts = React.useMemo(
    () =>
      message.parts
        .filter((part) => part.type === 'data-error')
        .filter((part) => {
          // OAuth errors are rendered inline, not in the error section
          return !isCredentialErrorMessage(part.data);
        }),
    [message.parts],
  );

  useDataStream();

  const partSegments = React.useMemo(
    () =>
      createMessagePartSegments(
        message.parts.filter(
          (part) =>
            part.type !== 'data-error' || isCredentialErrorMessage(part.data),
        ),
      ),
    [message.parts],
  );

  // Check if message only contains non-OAuth errors (no other content)
  const hasOnlyErrors = React.useMemo(() => {
    const nonErrorParts = message.parts.filter(
      (part) => part.type !== 'data-error',
    );
    // Only consider non-OAuth errors for this check
    return errorParts.length > 0 && nonErrorParts.length === 0;
  }, [message.parts, errorParts.length]);

  return (
    <div
      data-testid={`message-${message.role}`}
      className="group/message w-full"
      data-role={message.role}
    >
      <div
        className={cn('flex w-full items-start gap-2 md:gap-3', {
          'justify-end': message.role === 'user',
          'justify-start': message.role === 'assistant',
        })}
      >
        {message.role === 'assistant' && (
          <AnimatedAssistantIcon size={14} isLoading={isLoading} />
        )}

        <div
          className={cn('flex min-w-0 flex-col gap-3', {
            'w-full': message.role === 'assistant' || mode === 'edit',
            'min-h-96': message.role === 'assistant' && requiresScrollPadding,
            'max-w-[70%] sm:max-w-[min(fit-content,80%)]':
              message.role === 'user' && mode !== 'edit',
          })}
        >
          {attachmentsFromMessage.length > 0 && (
            <div
              data-testid={`message-attachments`}
              className="flex flex-row justify-end gap-2"
            >
              {attachmentsFromMessage.map((attachment) => (
                <PreviewAttachment
                  key={attachment.url}
                  attachment={{
                    name: attachment.filename ?? 'file',
                    contentType: attachment.mediaType,
                    url: attachment.url,
                  }}
                />
              ))}
            </div>
          )}

          {(() => {
            if (!partSegments) return null;

            const { sqlByTableIndex, sqlIndicesToSkip } =
              pairSqlWithTables(partSegments);
            const genieZone = getGenieZone(partSegments);

            let genieTableCounter = 0;
            const tableNumberByIndex = new Map<number, number>();
            if (genieZone) {
              for (
                let i = genieZone.start;
                i <= genieZone.end;
                i++
              ) {
                const [p] = partSegments[i];
                if (
                  p.type === 'text' &&
                  (isGenieTablePart(p) ||
                    (isTablePart(p) && sqlByTableIndex.has(i)))
                ) {
                  genieTableCounter++;
                  tableNumberByIndex.set(i, genieTableCounter);
                }
              }
            }
            const totalGenieTables = genieTableCounter;

            const renderSegment = (
              parts: (typeof partSegments)[number],
              index: number,
            ) => {
              const [part] = parts;
              const { type } = part;
              const key = `message-${message.id}-part-${index}`;

              if (sqlIndicesToSkip.has(index)) return null;

              if (type === 'reasoning' && part.text?.trim().length > 0) {
                return (
                  <MessageReasoning
                    key={key}
                    isLoading={isLoading}
                    reasoning={part.text}
                  />
                );
              }

              if (type === 'text') {
                if (isSqlPart(part)) {
                  return null;
                }
                if (isGenieTablePart(part)) {
                  const tableMarkdown = extractGenieTable(part);
                  if (tableMarkdown) {
                    const num = tableNumberByIndex.get(index);
                    return (
                      <GenieResultBlock
                        key={key}
                        markdown={tableMarkdown}
                        sql={sqlByTableIndex.get(index)}
                        tableNumber={
                          totalGenieTables > 1 ? num : undefined
                        }
                      />
                    );
                  }
                }
                if (isTablePart(part) && !isGenieTablePart(part)) {
                  const sql = sqlByTableIndex.get(index);
                  if (sql) {
                    const num = tableNumberByIndex.get(index);
                    return (
                      <GenieResultBlock
                        key={key}
                        markdown={part.text}
                        sql={sql}
                        tableNumber={
                          totalGenieTables > 1 ? num : undefined
                        }
                      />
                    );
                  }
                }
                if (isNamePart(part)) {
                  return (
                    <Streamdown
                      key={key}
                      className='-mb-2 mt-0 border-[var(--gold)] border-l-2 pl-3 text-muted-foreground'
                    >{`# ${formatNamePart(part)}`}</Streamdown>
                  );
                }
                if (mode === 'view') {
                  return (
                    <div key={key}>
                      <MessageContent
                        data-testid="message-content"
                        className={cn({
                          'w-fit break-words rounded-2xl px-3.5 py-2.5 text-right':
                            message.role === 'user',
                          'bg-transparent px-0 py-0 text-left':
                            message.role === 'assistant',
                        })}
                        style={
                          message.role === 'user'
                            ? {
                                backgroundColor: 'var(--ivory)',
                                color: 'var(--foreground)',
                              }
                            : undefined
                        }
                      >
                        <Response>
                          {sanitizeText(joinMessagePartSegments(parts))}
                        </Response>
                      </MessageContent>
                    </div>
                  );
                }

                if (mode === 'edit') {
                  return (
                    <div
                      key={key}
                      className="flex w-full flex-row items-start gap-3"
                    >
                      <div className="size-8" />
                      <div className="min-w-0 flex-1">
                        <MessageEditor
                          key={message.id}
                          message={message}
                          setMode={setMode}
                          setMessages={setMessages}
                          regenerate={regenerate}
                        />
                      </div>
                    </div>
                  );
                }
              }
              return null;
            };

            return partSegments.map((parts, index) => {
              const [part] = parts;
              const { type } = part;
              const key = `message-${message.id}-part-${index}`;

              if (
                genieZone &&
                index >= genieZone.start &&
                index <= genieZone.end
              ) {
                if (index === genieZone.start) {
                  return (
                    <GenieZoneWrapper
                      key={`${message.id}-genie-zone`}
                    >
                      {partSegments
                        .slice(genieZone.start, genieZone.end + 1)
                        .map((zoneParts, zi) => {
                          const el = renderSegment(
                            zoneParts,
                            genieZone.start + zi,
                          );
                          if (!el) return null;
                          return (
                            <motion.div
                              key={`genie-zone-${zi}`}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{
                                duration: 0.4,
                                delay: zi * 0.15,
                              }}
                            >
                              {el}
                            </motion.div>
                          );
                        })}
                    </GenieZoneWrapper>
                  );
                }
                return null;
              }

              const rendered = renderSegment(parts, index);
              if (rendered) return rendered;

            // Render Databricks tool calls and results
            if (part.type === `dynamic-tool`) {
              const { toolCallId, input, state, errorText, output, toolName } = part;

              // Check if this is an MCP tool call by looking for approvalRequestId in metadata
              // This works across all states (approval-requested, approval-denied, output-available)
              const isMcpApproval = part.callProviderMetadata?.databricks?.approvalRequestId != null;
              const mcpServerName = part.callProviderMetadata?.databricks?.mcpServerName?.toString();

              // Extract approval outcome for 'approval-responded' state
              // When addToolApprovalResponse is called, AI SDK sets the `approval` property
              // on the tool-call part and changes state to 'approval-responded'
              const approved: boolean | undefined =
                'approval' in part ? part.approval?.approved : undefined;


              // When approved but only have approval status (not actual output), show as input-available
              const effectiveState: ToolState = (() => {
                  if (part.providerExecuted && !isLoading && state === 'input-available') {
                    return 'output-available'
                  }
                return state;
              })()

              // Render MCP tool calls with special styling
              if (isMcpApproval) {
                return (
                  <McpTool key={toolCallId} defaultOpen={true}>
                    <McpToolHeader
                      serverName={mcpServerName}
                      toolName={toolName}
                      state={effectiveState}
                      approved={approved}
                    />
                    <McpToolContent>
                      <McpToolInput input={input} />
                      {state === 'approval-requested' && (
                        <McpApprovalActions
                          onApprove={() =>
                            submitApproval({
                              approvalRequestId: toolCallId,
                              approve: true,
                            })
                          }
                          onDeny={() =>
                            submitApproval({
                              approvalRequestId: toolCallId,
                              approve: false,
                            })
                          }
                          isSubmitting={
                            isSubmitting && pendingApprovalId === toolCallId
                          }
                        />
                      )}
                      {state === 'output-available' && output != null && (
                        <ToolOutput
                          output={
                            errorText ? (
                              <div className="rounded border p-2 text-red-500">
                                Error: {errorText}
                              </div>
                            ) : (
                              <div className="whitespace-pre-wrap font-mono text-sm">
                                {typeof output === 'string'
                                  ? output
                                  : JSON.stringify(output, null, 2)}
                              </div>
                            )
                          }
                          errorText={undefined}
                        />
                      )}
                    </McpToolContent>
                  </McpTool>
                );
              }

              // Render regular tool calls
              return (
                <Tool key={toolCallId} defaultOpen={true}>
                  <ToolHeader
                    type={toolName}
                    state={effectiveState}
                  />
                  <ToolContent>
                    <ToolInput input={input} />
                    {state === 'output-available' && (
                      <ToolOutput
                        output={
                          errorText ? (
                            <div className="rounded border p-2 text-red-500">
                              Error: {errorText}
                            </div>
                          ) : (
                            <div className="whitespace-pre-wrap font-mono text-sm">
                              {typeof output === 'string'
                                ? output
                                : JSON.stringify(output, null, 2)}
                            </div>
                          )
                        }
                        errorText={undefined}
                      />
                    )}
                  </ToolContent>
                </Tool>
              );
            }

            // Support for citations/annotations
            if (type === 'source-url') {
              return (
                <a
                  key={key}
                  href={part.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-baseline text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  <sup className="text-xs">[{part.title || part.url}]</sup>
                </a>
              );
            }

              // Render OAuth errors inline
              if (
                type === 'data-error' &&
                isCredentialErrorMessage(part.data)
              ) {
                return (
                  <MessageOAuthError
                    key={key}
                    error={part.data}
                    allMessages={allMessages}
                    setMessages={setMessages}
                    sendMessage={sendMessage}
                  />
                );
              }
            });
          })()}

          {message.role === 'assistant' && isLoading && bottomStep && (
            <div
              className="pt-2 text-sm text-muted-foreground"
              data-testid="message-bottom-step"
            >
              <span className="font-light">{formatGraphStepLabel(bottomStep.label)}</span>
            </div>
          )}

          {!isReadonly && !hasOnlyErrors && (
            <MessageActions
              key={`action-${message.id}`}
              message={message}
              isLoading={isLoading}
              setMode={setMode}
              errorCount={errorParts.length}
              showErrors={showErrors}
              onToggleErrors={() => setShowErrors(!showErrors)}
            />
          )}

          {errorParts.length > 0 && (hasOnlyErrors || showErrors) && (
            <div className="flex flex-col gap-2">
              {errorParts.map((part, index) => (
                <MessageError
                  key={`error-${message.id}-${index}`}
                  error={part.data}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const PreviewMessage = memo(
  PurePreviewMessage,
  (prevProps, nextProps) => {
    if (prevProps.isLoading !== nextProps.isLoading) return false;
    if (prevProps.message.id !== nextProps.message.id) return false;
    if (prevProps.requiresScrollPadding !== nextProps.requiresScrollPadding)
      return false;
    if (!equal(prevProps.message.parts, nextProps.message.parts)) return false;
    if (prevProps.bottomStep?.node !== nextProps.bottomStep?.node) return false;
    if (prevProps.bottomStep?.label !== nextProps.bottomStep?.label)
      return false;

    return false;
  },
);

/** Wording: display "Élaboration du plan de réponse" instead of "Requête Genie" for step labels (option B, client-only). */
function formatGraphStepLabel(label: string): string {
  return label.replace(/^Requête Genie(?=\s|$|\()/, "Élaboration du plan de réponse...");
}

export const AwaitingResponseMessage = ({
  graphSteps,
}: {
  graphSteps: GraphStepData[];
}) => {
  const role = 'assistant';
  const currentStep = graphSteps.at(-1) ?? null;
  const displayLabel = currentStep
    ? formatGraphStepLabel(currentStep.label)
    : null;

  return (
    <div
      data-testid="message-assistant-loading"
      className="group/message w-full"
      data-role={role}
    >
      <div className="flex items-start justify-start gap-3">
        <AnimatedAssistantIcon size={14} isLoading={false} muted={true} />

        <div className="flex w-full flex-col gap-1">
          <AnimatePresence mode="popLayout">
            {currentStep == null ? (
              <motion.div
                key="thinking-fallback"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="p-0 text-sm"
              >
                <ShimmerText>Connexion à l'agent...</ShimmerText>
              </motion.div>
            ) : (
              <motion.div
                key={`${currentStep.node}-${currentStep.timestamp}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="p-0 text-sm"
              >
                <ShimmerText>{displayLabel}</ShimmerText>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

const ShimmerText = ({ children }: { children: React.ReactNode }) => {
  return (
    <motion.span
      animate={{ opacity: [0.4, 0.9, 0.4] }}
      transition={{
        duration: 2,
        repeat: Number.POSITIVE_INFINITY,
        ease: 'easeInOut',
      }}
      className="font-light text-muted-foreground"
    >
      {children}
    </motion.span>
  );
};
