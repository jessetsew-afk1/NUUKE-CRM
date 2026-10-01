import { motion } from 'framer-motion';
import { Logo } from './Logo';

export function Splash({ inline }: { inline?: boolean }) {
  return (
    <div className={inline ? 'grid min-h-[50vh] place-items-center' : 'relative z-10 grid min-h-dvh place-items-center'}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: [0.4, 1, 0.4], scale: 1 }}
        transition={{ opacity: { duration: 1.6, repeat: Infinity }, scale: { duration: 0.4 } }}
      >
        <Logo markOnly className="size-12" />
      </motion.div>
    </div>
  );
}
