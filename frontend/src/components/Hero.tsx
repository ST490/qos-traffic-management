import { motion } from 'framer-motion';

const headingWords = ['Every', 'packet', 'is', 'not', 'equal.'];

const container = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12, delayChildren: 0.3 },
  },
};

const wordVariant = {
  hidden: { y: 60, opacity: 0, clipPath: 'inset(100% 0 0 0)' },
  visible: {
    y: 0,
    opacity: 1,
    clipPath: 'inset(0% 0 0 0)',
    transition: { duration: 0.6, ease: 'easeOut' as const },
  },
};

export default function Hero() {
  return (
    <section className="pt-8 pb-12 md:pt-16 md:pb-20" aria-label="Hero">
      <motion.h1
        className="font-display text-[clamp(2.5rem,8vw,6.5rem)] leading-[0.95] tracking-tight text-[var(--text)]"
        variants={container}
        initial="hidden"
        animate="visible"
      >
        {headingWords.map((word, i) => (
          <span key={i} className="inline-block overflow-hidden mr-[0.25em]">
            <motion.span className="inline-block" variants={wordVariant}>
              {word}
            </motion.span>
          </span>
        ))}
      </motion.h1>
      <motion.p
        className="mt-6 max-w-xl text-lg text-[var(--text-dim)] font-ui"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.0, duration: 0.5 }}
      >
        Real-time QoS traffic shaping across four service classes.
        Watch how priority policies protect latency-sensitive flows
        when the bottleneck saturates.
      </motion.p>
    </section>
  );
}
