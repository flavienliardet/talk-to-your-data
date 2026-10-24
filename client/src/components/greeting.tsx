import { motion } from 'framer-motion';

export const Greeting = () => {
  return (
    <div
      key="overview"
      className="mx-auto mt-8 flex size-full max-w-3xl flex-col items-center justify-center px-4 text-center md:mt-24 md:px-8"
    >
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="font-display text-2xl tracking-wide md:text-3xl"
      >
        Bienvenue
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.65, duration: 0.5 }}
        className="mt-2 text-base text-muted-foreground tracking-wide md:text-lg"
      >
        Comment puis-je vous aider ?
      </motion.div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9, duration: 0.6 }}
        className="mt-6 h-px w-16 bg-[var(--gold)]"
      />
    </div>
  );
};
