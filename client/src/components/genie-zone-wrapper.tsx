import { type ReactNode, useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDownIcon } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface GenieZoneWrapperProps {
  children: ReactNode;
}

export function GenieZoneWrapper({ children }: GenieZoneWrapperProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="not-prose w-full"
    >
      <CollapsibleTrigger
        className={cn(
          'flex items-center gap-1.5 rounded-md px-2 py-1',
          'text-muted-foreground text-xs transition-colors',
          'hover:bg-muted hover:text-foreground',
        )}
      >
        <span className='uppercase tracking-wide'>Résultat</span>
        <ChevronDownIcon
          className={cn(
            'size-3 transition-transform',
            isOpen ? 'rotate-180' : 'rotate-0',
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent
        className={cn(
          'mt-2 flex flex-col gap-3',
          'data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2',
          'data-[state=open]:slide-in-from-top-2',
          'outline-hidden data-[state=closed]:animate-out data-[state=open]:animate-in',
        )}
      >
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
