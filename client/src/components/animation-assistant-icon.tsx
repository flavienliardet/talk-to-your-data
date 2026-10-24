import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Bot } from 'lucide-react';

type AnimatedAssistantIconProps = {
  size?: number;
  isLoading?: boolean;
  muted?: boolean;
};

export const AnimatedAssistantIcon = ({
  size = 20,
  isLoading = false,
  muted = false,
}: AnimatedAssistantIconProps) => {
  return (
    <motion.div
      className={cn(
        '-mt-1 flex shrink-0 items-center justify-center rounded-full bg-foreground p-1.5',
        { 'opacity-40': muted },
      )}
      style={{ width: size + 12, height: size + 12 }}
      animate={
        isLoading && !muted ? { scale: [0.95, 1.05] } : { scale: 1 }
      }
      transition={
        isLoading && !muted
          ? {
              repeat: Number.POSITIVE_INFINITY,
              repeatType: 'reverse' as const,
              duration: 1.2,
              ease: 'easeInOut',
            }
          : { duration: 0.3 }
      }
    >
      <Bot className="h-full w-full text-primary-foreground" size={size} />
    </motion.div>
  );
};
