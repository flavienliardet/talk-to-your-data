import { z } from 'zod';
import type { LanguageModelUsage, UIMessage } from 'ai';

const messageMetadataSchema = z.object({
  createdAt: z.string(),
});

type MessageMetadata = z.infer<typeof messageMetadataSchema>;


export interface GraphStepData {
  label: string;
  node: string;
  timestamp: number;
}

export interface SuggestedQuestionsData {
  suggestedQuestions: string[];
}

export type CustomUIDataTypes = {
  error: string;
  usage: LanguageModelUsage;
  'graph-step': GraphStepData;
  'suggested-questions': SuggestedQuestionsData;
};

export type ChatMessage = UIMessage<
  MessageMetadata,
  CustomUIDataTypes
>;

export interface Attachment {
  name: string;
  url: string;
  contentType: string;
}

export type { VisibilityType } from '@chat-template/utils';
