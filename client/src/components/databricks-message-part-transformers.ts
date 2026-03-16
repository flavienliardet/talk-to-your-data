import type { ChatMessage } from '@chat-template/core';
import { createDatabricksMessageCitationMarkdown } from './databricks-message-citation';
import type { TextUIPart } from 'ai';

/**
 * Splits text parts that contain embedded <genie-sql> or <genie-table> tags
 * into separate parts so each tag gets its own segment for rendering.
 */
const splitEmbeddedParts = (
  parts: ChatMessage['parts'],
): ChatMessage['parts'] => {
  const result: ChatMessage['parts'] = [];
  const tagRegex =
    /(<genie-sql>[\s\S]*?<\/genie-sql>|<genie-table>[\s\S]*?<\/genie-table>)/g;

  for (const part of parts) {
    if (part.type !== 'text' || !part.text) {
      result.push(part);
      continue;
    }

    if (
      !part.text.includes('<genie-sql>') &&
      !part.text.includes('<genie-table>')
    ) {
      result.push(part);
      continue;
    }

    if (isSqlPart(part) || isGenieTablePart(part)) {
      result.push(part);
      continue;
    }

    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(part.text)) !== null) {
      const before = part.text.slice(lastIndex, match.index);
      if (before.trim()) {
        result.push({ type: 'text', text: before });
      }
      result.push({ type: 'text', text: match[1] });
      lastIndex = match.index + match[0].length;
    }
    tagRegex.lastIndex = 0;

    const after = part.text.slice(lastIndex);
    if (after.trim()) {
      result.push({ type: 'text', text: after });
    }
  }

  return result;
};

/**
 * Creates segments of parts that can be rendered as a single component.
 * Used to render citations as part of the associated text.
 */
export const createMessagePartSegments = (parts: ChatMessage['parts']) => {
  const splitParts = splitEmbeddedParts(parts);
  const out: ChatMessage['parts'][] = [];
  for (const part of splitParts) {
    const lastBlock = out[out.length - 1] || null;
    const previousPart = lastBlock?.[lastBlock.length - 1] || null;

    // If the previous part is a text part and the current part is a source part, add it to the current block
    if (previousPart?.type === 'text' && part.type === 'source-url') {
      lastBlock.push(part);
    }
    // If the previous part is a source-url part and the current part is a source part, add it to the current block
    else if (
      previousPart?.type === 'source-url' &&
      part.type === 'source-url'
    ) {
      lastBlock.push(part);
    } else if (
      lastBlock?.[0]?.type === 'text' &&
      part.type === 'text' &&
      !isNamePart(part) &&
      !isNamePart(lastBlock[0]) &&
      !isSqlPart(part) &&
      !isTablePart(part) &&
      !isGenieTablePart(part) &&
      !isSqlPart(lastBlock[0]) &&
      !isTablePart(lastBlock[0]) &&
      !isGenieTablePart(lastBlock[0])
    ) {
      // If the text part, or the previous part contains a <name></name> tag, add it to a new block
      // Otherwise, append sequential text parts to the same block
      lastBlock.push(part);
      //   }
    }
    // Otherwise, add the current part to a new block
    else {
      out.push([part]);
    }
  }

  return out;
};

export const isSqlPart = (
  part: ChatMessage['parts'][number],
): part is TextUIPart => {
  return (
    part.type === 'text' &&
    part.text?.startsWith('<genie-sql>') &&
    part.text?.endsWith('</genie-sql>')
  );
};

export const extractSql = (
  part: ChatMessage['parts'][number],
): string | null => {
  if (!isSqlPart(part)) return null;
  return (
    part.text?.replace('<genie-sql>', '').replace('</genie-sql>', '') ?? null
  );
};

export const isGenieTablePart = (
  part: ChatMessage['parts'][number],
): part is TextUIPart => {
  return (
    part.type === 'text' &&
    part.text?.startsWith('<genie-table>') &&
    part.text?.endsWith('</genie-table>')
  );
};

/**
 * Extracts markdown table content from a <genie-table> part
 * and strips the pandas index column (first column with numeric indices).
 */
export const extractGenieTable = (
  part: ChatMessage['parts'][number],
): string | null => {
  if (!isGenieTablePart(part)) return null;
  const raw =
    part.text
      ?.replace('<genie-table>', '')
      .replace('</genie-table>', '')
      .trim() ?? null;
  if (!raw) return null;
  return stripPandasIndex(raw);
};

/**
 * Removes the first column from a markdown table when it looks like
 * a pandas DataFrame index (empty header + numeric values).
 */
function stripPandasIndex(md: string): string {
  const lines = md.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return md;

  const headerCells = lines[0].split('|').map((c) => c.trim());
  // pandas index: first meaningful cell after leading pipe is empty
  // headerCells[0] is '' (before first |), headerCells[1] should be '' (index col)
  const isIndex = headerCells.length > 2 && headerCells[1] === '';
  if (!isIndex) return md;

  return lines
    .map((line) => {
      const parts = line.split('|');
      // Remove the index cell (parts[1]) while keeping the leading pipe
      return `|${parts.slice(2).join('|')}`;
    })
    .join('\n');
}

/**
 * Pairs each SQL segment with its immediately following table segment.
 * Returns a map of table segment index → associated SQL string,
 * and a set of SQL segment indices to skip during rendering.
 */
export function pairSqlWithTables(
  segments: ChatMessage['parts'][],
): {
  sqlByTableIndex: Map<number, string>;
  sqlIndicesToSkip: Set<number>;
} {
  const sqlByTableIndex = new Map<number, string>();
  const sqlIndicesToSkip = new Set<number>();

  for (let i = 0; i < segments.length; i++) {
    const [part] = segments[i];
    if (part.type !== 'text' || !isSqlPart(part)) continue;

    const sql = extractSql(part);
    if (!sql) continue;

    const next = segments[i + 1];
    const nextPart = next?.[0];
    if (
      nextPart?.type === 'text' &&
      (isGenieTablePart(nextPart) || isTablePart(nextPart))
    ) {
      sqlByTableIndex.set(i + 1, sql);
      sqlIndicesToSkip.add(i);
    }
  }

  return { sqlByTableIndex, sqlIndicesToSkip };
}

/**
 * Detects the contiguous "Genie zone" in the segments: the range that contains
 * all <genie-sql> and <genie-table> tagged parts, plus preceding name headers.
 * Trailing text (e.g. LLM analysis after results) is excluded. Returns null if no Genie content is found.
 */
export function getGenieZone(
  segments: ChatMessage['parts'][],
): { start: number; end: number } | null {
  let first = -1;
  let last = -1;

  for (let i = 0; i < segments.length; i++) {
    const [part] = segments[i];
    if (
      part.type === 'text' &&
      (isSqlPart(part) || isGenieTablePart(part))
    ) {
      if (first === -1) first = i;
      last = i;
    }
  }

  if (first === -1) return null;

  let start = first;
  while (start > 0) {
    const [prev] = segments[start - 1];
    if (prev.type === 'text' && isNamePart(prev)) {
      start--;
    } else {
      break;
    }
  }

  return { start, end: last };
}

/**
 * Fallback: detects markdown table parts by looking for the separator row pattern (|---|)
 */
export const isTablePart = (
  part: ChatMessage['parts'][number],
): part is TextUIPart => {
  if (part.type !== 'text' || !part.text) return false;
  return /\|[\s-]*:?-+:?[\s-]*\|/.test(part.text);
};

export const isNamePart = (
  part: ChatMessage['parts'][number],
): part is TextUIPart => {
  return (
    part.type === 'text' &&
    part.text?.startsWith('<name>') &&
    part.text?.endsWith('</name>')
  );
};
export const formatNamePart = (part: ChatMessage['parts'][number]) => {
  if (!isNamePart(part)) return null;
  return part.text?.replace('<name>', '').replace('</name>', '');
};

/**
 * Takes a segment of parts and joins them into a markdown-formatted string.
 * Used to render citations as part of the associated text.
 */
export const joinMessagePartSegments = (parts: ChatMessage['parts']) => {
  return parts.reduce((acc, part) => {
    switch (part.type) {
      case 'text':
        return acc + part.text;
      case 'source-url':
        console.log("acc.endsWith('|')", acc.endsWith('|'));
        // Special case for markdown tables
        if (acc.endsWith('|')) {
          // 1. Remove the last pipe
          // 2. Insert the citation markdown
          // 3. Add the pipe back
          return `${acc.slice(0, -1)} ${createDatabricksMessageCitationMarkdown(part)}|`;
        }
        return `${acc} ${createDatabricksMessageCitationMarkdown(part)}`;
      default:
        return acc;
    }
  }, '');
};
