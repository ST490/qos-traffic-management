import { motion } from 'framer-motion';
import NumberTicker from './NumberTicker';
import type { ClassMetrics, TrafficClass } from '../types';
import { CLASS_CONFIG } from '../types';

interface ClassCardsProps {
  metrics: Record<TrafficClass, ClassMetrics>;
  throttled?: TrafficClass[];
}

const order: TrafficClass[] = ['voip', 'video', 'web', 'bulk'];

const cardVariant = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1 + 0.2, duration: 0.5, ease: 'easeOut' as const },
  }),
};

export default function ClassCards({ metrics, throttled = [] }: ClassCardsProps) {
  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Traffic class metrics">
      {order.map((cls, i) => {
        const cfg = CLASS_CONFIG[cls];
        const m = metrics[cls];
        const isThrottled = throttled.includes(cls);

        return (
          <motion.div
            key={cls}
            className="glass-card p-5"
            custom={i}
            variants={cardVariant}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: cfg.color }}
                />
                <span className="label-sm" style={{ color: cfg.color }}>
                  {cfg.label}
                </span>
              </div>
              {isThrottled && (
                <span className="text-[0.6rem] uppercase tracking-wider font-semibold text-[var(--text-dim)] border border-[var(--border)] rounded px-1.5 py-0.5">
                  capped
                </span>
              )}
            </div>

            {/* Throughput */}
            <div className="mb-3">
              <NumberTicker
                value={m?.throughput_mbps ?? 0}
                decimals={2}
                suffix="Mbps"
                fontSize="text-3xl"
              />
            </div>

            {/* Latency & Loss */}
            <div className="flex items-center gap-2 text-xs text-[var(--text-dim)] font-mono mb-4">
              <span>{(m?.latency_avg_ms ?? 0).toFixed(0)} ms</span>
              <span>·</span>
              <span>{(m?.loss_percent ?? 0).toFixed(1)}% loss</span>
            </div>

            {/* Progress bar */}
            <div className="h-1 w-full rounded-full bg-[var(--border)] overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: cfg.color }}
                initial={{ width: 0 }}
                animate={{
                  width: `${Math.min(100, ((m?.throughput_mbps ?? 0) / 10) * 100)}%`,
                }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
          </motion.div>
        );
      })}
    </section>
  );
}
