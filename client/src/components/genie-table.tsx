import { cn } from '@/lib/utils';
import {
  DownloadIcon,
  ChevronDownIcon,
  CopyIcon,
  CheckIcon,
  CodeIcon,
  TableIcon,
  ExternalLinkIcon,
} from 'lucide-react';
import {
  type ComponentProps,
  type ReactElement,
  type ReactNode,
  Children,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { CodeBlock } from './elements/code-block';
import { useSession } from '@/contexts/SessionContext';

function extractMainTable(
  sql: string,
): { catalog: string; schema: string; table: string } | null {
  const match = sql.match(
    /\bFROM\s+`?(\w+)`?\.`?(\w+)`?\.`?(\w+)`?/i,
  );
  if (!match) return null;
  return { catalog: match[1], schema: match[2], table: match[3] };
}

function buildDatabricksTableUrl(
  host: string,
  catalog: string,
  schema: string,
  table: string,
): string {
  const cleanHost = host.replace(/\/+$/, '');
  const orgMatch = cleanHost.match(/adb-(\d+)/);
  const _orgParam = orgMatch ? `?o=${orgMatch[1]}` : '';
  const query = orgMatch
    ? `?o=${orgMatch[1]}&activeTab=sample`
    : '?activeTab=sample';
  return `${cleanHost}/explore/data/${catalog}/${schema}/${table}${query}`;
}

function extractTextContent(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (!isValidElement(node)) return '';
  const children = (node.props as { children?: ReactNode }).children;
  if (!children) return '';
  return Children.toArray(children).map(extractTextContent).join('');
}

function isRowElement(node: ReactNode): node is ReactElement {
  if (!isValidElement(node)) return false;
  return node.type === 'tr' || node.type === GenieTr;
}

function tableToCSV(children: ReactNode): string {
  const rows: string[][] = [];

  const processRow = (row: ReactElement) => {
    const cells: string[] = [];
    const rowChildren = (row.props as { children?: ReactNode }).children;
    Children.forEach(rowChildren, (cell) => {
      if (isValidElement(cell)) {
        const text = extractTextContent(cell).replace(/"/g, '""');
        cells.push(`"${text}"`);
      }
    });
    rows.push(cells);
  };

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const tag = child.type;
    if (tag === 'thead' || tag === 'tbody') {
      const sectionChildren = (child.props as { children?: ReactNode })
        .children;
      Children.forEach(sectionChildren, (row) => {
        if (isRowElement(row)) processRow(row);
      });
    }
  });

  return rows.map((r) => r.join(',')).join('\n');
}

function downloadCSV(csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'query-results.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function rowsToCSV(headers: string[], rows: string[][]): string {
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const headerLine = headers.map(escape).join(',');
  const dataLines = rows.map((row) => row.map(escape).join(','));
  return [headerLine, ...dataLines].join('\n');
}

const CHUNK_SIZE = 50;

export type ProgressiveGenieTableProps = {
  headers: string[];
  rows: string[][];
  sql?: string;
  tableNumber?: number;
};

export function ProgressiveGenieTable({
  headers,
  rows,
  sql,
  tableNumber,
}: ProgressiveGenieTableProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [displayedCount, setDisplayedCount] = useState(() =>
    Math.min(CHUNK_SIZE, rows.length),
  );
  const rafRef = useRef<number | null>(null);
  const { session } = useSession();

  const csv = useMemo(() => rowsToCSV(headers, rows), [headers, rows]);
  const targetCount = rows.length;

  useEffect(() => {
    if (displayedCount >= targetCount) return;
    const schedule = () => {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setDisplayedCount((prev) =>
          Math.min(prev + CHUNK_SIZE, targetCount),
        );
      });
    };
    schedule();
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [displayedCount, targetCount]);

  const databricksTableUrl = useMemo(() => {
    if (!sql || !session?.databricksHost) return null;
    const tableInfo = extractMainTable(sql);
    if (!tableInfo) return null;
    return buildDatabricksTableUrl(
      session.databricksHost,
      tableInfo.catalog,
      tableInfo.schema,
      tableInfo.table,
    );
  }, [sql, session?.databricksHost]);

  const handleCopy = () => {
    navigator.clipboard.writeText(csv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayRows = rows.slice(0, displayedCount);

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="not-prose w-full"
    >
      <div className="flex items-center justify-between">
        <CollapsibleTrigger
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2 py-1',
            'text-muted-foreground text-xs transition-colors',
            'hover:bg-muted hover:text-foreground',
          )}
        >
          <span className="uppercase tracking-wide">
            {tableNumber != null ? `Table ${tableNumber}` : 'Table'}
          </span>
          <ChevronDownIcon
            className={cn(
              'size-3 transition-transform',
              isOpen ? 'rotate-180' : 'rotate-0',
            )}
          />
        </CollapsibleTrigger>
        {isOpen && (
          <div className="flex items-center gap-1">
            {databricksTableUrl && (
              <a
                href={databricksTableUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'flex items-center gap-1 rounded px-1.5 py-1',
                  'text-xs transition-colors',
                  'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
                aria-label="Ouvrir la table dans Databricks"
              >
                <ExternalLinkIcon className="size-3" />
                <span>Databricks</span>
              </a>
            )}
            {sql && (
              <button
                onClick={() => setShowCode((v) => !v)}
                className={cn(
                  'flex items-center gap-1 rounded px-1.5 py-1',
                  'text-xs transition-colors',
                  showCode
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
                type="button"
                aria-label={showCode ? 'Table' : 'Code'}
              >
                {showCode ? (
                  <>
                    <TableIcon className="size-3" />
                    <span>Table</span>
                  </>
                ) : (
                  <>
                    <CodeIcon className="size-3" />
                    <span>Code</span>
                  </>
                )}
              </button>
            )}
            <button
              onClick={handleCopy}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              type="button"
              aria-label={copied ? 'Copied' : 'Copy as CSV'}
            >
              {copied ? (
                <CheckIcon className="size-3.5 text-green-500" />
              ) : (
                <CopyIcon className="size-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => downloadCSV(csv)}
              className={cn(
                'flex items-center gap-1 rounded px-1.5 py-1',
                'text-muted-foreground text-xs transition-colors',
                'hover:bg-muted hover:text-foreground',
              )}
            >
              <DownloadIcon className="size-3" />
              <span>CSV</span>
            </button>
          </div>
        )}
      </div>
      <CollapsibleContent
        className={cn(
          'mt-2',
          'data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2',
          'data-[state=open]:slide-in-from-top-2',
          'outline-hidden data-[state=closed]:animate-out data-[state=open]:animate-in',
        )}
      >
        {showCode && sql ? (
          <CodeBlock code={sql} language="sql" />
        ) : (
          <div className="max-h-96 overflow-auto rounded-[var(--radius)] border border-border/60">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-muted">
                <tr>
                  {headers.map((h, i) => (
                    <GenieTh key={i}>{h}</GenieTh>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row, rowIndex) => (
                  <GenieTr
                    key={rowIndex}
                    className={cn(
                      rowIndex % 2 === 0 ? 'bg-background' : 'bg-muted/30',
                    )}
                  >
                    {row.map((cell, i) => (
                      <GenieTd key={i}>{cell}</GenieTd>
                    ))}
                  </GenieTr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

type GenieTableProps = ComponentProps<'table'> & {
  sql?: string;
  tableNumber?: number;
};

export function GenieTable({
  children,
  className,
  sql,
  tableNumber,
  ...props
}: GenieTableProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const { session } = useSession();

  const csv = useMemo(() => tableToCSV(children), [children]);

  const databricksTableUrl = useMemo(() => {
    if (!sql || !session?.databricksHost) return null;
    const tableInfo = extractMainTable(sql);
    if (!tableInfo) return null;
    return buildDatabricksTableUrl(
      session.databricksHost,
      tableInfo.catalog,
      tableInfo.schema,
      tableInfo.table,
    );
  }, [sql, session?.databricksHost]);

  const handleCopy = () => {
    navigator.clipboard.writeText(csv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = () => {
    downloadCSV(csv);
  };

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="not-prose w-full"
    >
      <div className="flex items-center justify-between">
        <CollapsibleTrigger
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2 py-1',
            'text-muted-foreground text-xs transition-colors',
            'hover:bg-muted hover:text-foreground',
          )}
        >
          <span className='uppercase tracking-wide'>
            {tableNumber != null ? `Table ${tableNumber}` : 'Table'}
          </span>
          <ChevronDownIcon
            className={cn(
              'size-3 transition-transform',
              isOpen ? 'rotate-180' : 'rotate-0',
            )}
          />
        </CollapsibleTrigger>
        {isOpen && (
          <div className="flex items-center gap-1">
            {databricksTableUrl && (
              <a
                href={databricksTableUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'flex items-center gap-1 rounded px-1.5 py-1',
                  'text-xs transition-colors',
                  'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
                aria-label="Ouvrir la table dans Databricks"
              >
                <ExternalLinkIcon className="size-3" />
                <span>Databricks</span>
              </a>
            )}
            {sql && (
              <button
                onClick={() => setShowCode((v) => !v)}
                className={cn(
                  'flex items-center gap-1 rounded px-1.5 py-1',
                  'text-xs transition-colors',
                  showCode
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
                type="button"
                aria-label={showCode ? 'Table' : 'Code'}
              >
                {showCode ? (
                  <>
                    <TableIcon className="size-3" />
                    <span>Table</span>
                  </>
                ) : (
                  <>
                    <CodeIcon className="size-3" />
                    <span>Code</span>
                  </>
                )}
              </button>
            )}
            <button
              onClick={handleCopy}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              type="button"
              aria-label={copied ? 'Copied' : 'Copy as CSV'}
            >
              {copied ? (
                <CheckIcon className="size-3.5 text-green-500" />
              ) : (
                <CopyIcon className="size-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={handleExport}
              className={cn(
                'flex items-center gap-1 rounded px-1.5 py-1',
                'text-muted-foreground text-xs transition-colors',
                'hover:bg-muted hover:text-foreground',
              )}
            >
              <DownloadIcon className="size-3" />
              <span>CSV</span>
            </button>
          </div>
        )}
      </div>
      <CollapsibleContent
        className={cn(
          'mt-2',
          'data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2',
          'data-[state=open]:slide-in-from-top-2',
          'outline-hidden data-[state=closed]:animate-out data-[state=open]:animate-in',
        )}
      >
        {showCode && sql ? (
          <CodeBlock code={sql} language="sql" />
        ) : (
          <div className="max-h-96 overflow-x-auto rounded-[var(--radius)] border border-border/60">
            <table
              className={cn('w-full border-collapse text-sm', className)}
              {...props}
            >
              {children}
            </table>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

type GenieThProps = ComponentProps<'th'>;

export function GenieTh({ children, className, ...props }: GenieThProps) {
  return (
    <th
      className={cn(
        'sticky top-0 z-10 bg-muted px-3 py-2.5 text-left',
        'font-medium text-[11px] text-muted-foreground uppercase tracking-[0.08em]',
        'whitespace-nowrap border-b',
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

type GenieTdProps = ComponentProps<'td'>;

export function GenieTd({ children, className, ...props }: GenieTdProps) {
  return (
    <td
      className={cn(
        'whitespace-nowrap border-b px-3 py-2 font-mono text-xs',
        className,
      )}
      {...props}
    >
      {children}
    </td>
  );
}

type GenieTrProps = ComponentProps<'tr'>;

export function GenieTr({ children, className, ...props }: GenieTrProps) {
  return (
    <tr
      className={cn('transition-colors hover:bg-muted/50', className)}
      {...props}
    >
      {children}
    </tr>
  );
}
