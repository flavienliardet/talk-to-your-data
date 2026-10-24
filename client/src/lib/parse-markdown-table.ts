/**
 * Parses a markdown table string into a structure suitable for rendering.
 * Expects format:
 *   | col1 | col2 |
 *   | --- | --- |
 *   | a   | b   |
 */
export interface ParsedMarkdownTable {
  headers: string[];
  rows: string[][];
}

function parseRow(line: string, columnCount: number): string[] {
  const cells = line.split('|').map((c) => c.trim());
  const trimmed = cells.slice(1, -1);
  if (trimmed.length !== columnCount) {
    if (trimmed.length < columnCount) {
      return [...trimmed, ...Array(columnCount - trimmed.length).fill('')];
    }
    return trimmed.slice(0, columnCount);
  }
  return trimmed;
}

export function parseMarkdownTable(md: string): ParsedMarkdownTable | null {
  const lines = md.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;

  const headerCells = lines[0].split('|').map((c) => c.trim());
  const headers = headerCells.slice(1, -1);
  if (headers.length === 0) return null;

  const sep = lines[1];
  if (!/^\|[\s\-:|]+\|/.test(sep) || !sep.includes('-')) return null;

  const columnCount = headers.length;
  const rows: string[][] = [];
  for (let i = 2; i < lines.length; i++) {
    rows.push(parseRow(lines[i], columnCount));
  }

  return { headers, rows };
}
