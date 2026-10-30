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
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05 + 0.1, duration: 0.4, ease: 'easeOut' as const },
  }),
};

export default function ClassCards({ metrics, throttled = [] }: ClassCardsProps) {
  return (
    <section
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full min-w-0"
      aria-label="Traffic class metrics"
    >
      {order.map((cls, i) => {
        const cfg = CLASS_CONFIG[cls];
        const m = metrics[cls];
        const isThrottled = throttled.includes(cls);
        const throughput = m?.throughput_mbps ?? 0;
        const latency = m?.latency_avg_ms ?? 0;
        const loss = m?.loss_percent ?? 0;

        return (
          <motion.div
            key={cls}
            className="card-surface p-5 sm:p-6 flex flex-col justify-between h-full min-w-0 w-full"
            custom={i}
            variants={cardVariant}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            data-crosshair-target
          >
            <div>
              {/* Header row: colored dot + label */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: cfg.color }}
                  />
                  <span
                    className="card-title text-xs font-semibold tracking-wider uppercase truncate"
                    style={{ color: cfg.color }}
                  >
                    {cfg.label}
                  </span>
                </div>

                {isThrottled && (
                  <span className="text-[11px] font-mono uppercase tracking-wider font-semibold text-[#FF7A45] border border-[#FF7A45]/30 bg-[#FF7A45]/10 rounded-full px-2 py-0.5 flex-shrink-0">
                    capped
                  </span>
                )}
              </div>

              {/* Big metric number (40-48px) with unit baseline aligned */}
              <div className="flex items-baseline gap-2 my-1">
                <NumberTicker
                  value={throughput}
                  decimals={2}
                  fontSize="text-[40px] sm:text-[44px]"
                  className="font-mono text-[#F3F4F6] font-semibold tracking-tight tabular-nums"
                />
                <span className="text-[14px] font-ui text-white/45 font-normal">
                  Mbps
                </span>
              </div>

              {/* Secondary stats (latency, loss): 13px muted */}
              <div className="flex items-center gap-2 text-[13px] text-white/50 font-mono tracking-tight mt-2">
                <span>{latency.toFixed(0)} ms</span>
                <span className="text-white/20">·</span>
                <span>{loss.toFixed(1)}% loss</span>
                {isThrottled && (
                  <>
                    <span className="text-white/20">·</span>
                    <span className="text-[#FF7A45]">capped</span>
                  </>
                )}
              </div>
            </div>

            {/* Bottom progress bar: 6px height, 20px margin from stats */}
            <div className="h-[6px] w-full rounded-full bg-white/[0.06] overflow-hidden mt-5">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: cfg.color }}
                initial={{ width: 0 }}
                animate={{
                  width: `${Math.min(100, Math.max(2, (throughput / 10) * 100))}%`,
                }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
          </motion.div>
        );
      })}
    </section>
  );
}
