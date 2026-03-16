import { type ComponentProps, useMemo } from 'react';
import { parseMarkdownTable } from '@/lib/parse-markdown-table';
import { DatabricksMessageCitationStreamdownIntegration } from './databricks-message-citation';
import {
  GenieTable,
  GenieTh,
  GenieTd,
  GenieTr,
  ProgressiveGenieTable,
} from './genie-table';
import { Streamdown } from 'streamdown';

interface GenieResultBlockProps {
  markdown: string;
  sql?: string;
  tableNumber?: number;
}

export function GenieResultBlock({
  markdown,
  sql,
  tableNumber,
}: GenieResultBlockProps) {
  const parsed = useMemo(() => parseMarkdownTable(markdown), [markdown]);

  if (parsed !== null) {
    return (
      <ProgressiveGenieTable
        headers={parsed.headers}
        rows={parsed.rows}
        sql={sql}
        tableNumber={tableNumber}
      />
    );
  }

  const TableWithProps = useMemo(() => {
    if (!sql && tableNumber == null) return GenieTable;
    const WrappedTable = (props: ComponentProps<typeof GenieTable>) => (
      <GenieTable {...props} sql={sql} tableNumber={tableNumber} />
    );
    WrappedTable.displayName = 'GenieTableWithProps';
    return WrappedTable;
  }, [sql, tableNumber]);

  return (
    <Streamdown
      components={{
        a: DatabricksMessageCitationStreamdownIntegration,
        table: TableWithProps,
        th: GenieTh,
        td: GenieTd,
        tr: GenieTr,
      }}
      className="flex flex-col gap-4"
    >
      {markdown}
    </Streamdown>
  );
}
