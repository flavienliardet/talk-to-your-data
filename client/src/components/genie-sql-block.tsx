import { useState } from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import {
  DatabaseIcon,
  ChevronDownIcon,
  CopyIcon,
  CheckIcon,
} from 'lucide-react';
import { CodeBlock } from './elements/code-block';

interface GenieSqlBlockProps {
  sql: string;
}

export function GenieSqlBlock({ sql }: GenieSqlBlockProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="not-prose w-full"
    >
      <div className="flex items-center gap-2">
        <CollapsibleTrigger
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2 py-1',
            'text-muted-foreground text-xs transition-colors',
            'hover:bg-muted hover:text-foreground',
          )}
        >
          <DatabaseIcon className="size-4" />
          <span>SQL Query</span>
          <ChevronDownIcon
            className={cn(
              'size-3 transition-transform',
              isOpen ? 'rotate-180' : 'rotate-0',
            )}
          />
        </CollapsibleTrigger>
        {isOpen && (
          <button
            onClick={handleCopy}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            type="button"
            aria-label={copied ? 'Copied' : 'Copy SQL'}
          >
            {copied ? (
              <CheckIcon className="size-3.5 text-green-500" />
            ) : (
              <CopyIcon className="size-3.5" />
            )}
          </button>
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
        <CodeBlock code={sql} language="sql" />
      </CollapsibleContent>
    </Collapsible>
  );
}
