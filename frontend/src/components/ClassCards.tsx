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
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08 + 0.15, duration: 0.5, ease: 'easeOut' as const },
  }),
};

export default function ClassCards({ metrics, throttled = [] }: ClassCardsProps) {
  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6" aria-label="Traffic class metrics">
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
            className="rounded-2xl border border-[#1f1f24] hover:border-[#2a2a32] bg-[#111114] p-6 md:p-7 flex flex-col justify-between transition-all duration-300 shadow-[0_4px_24px_rgba(0,0,0,0.4)] group"
            custom={i}
            variants={cardVariant}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            data-crosshair-target
          >
            {/* Header row */}
            <div>
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]"
                    style={{ backgroundColor: cfg.color, color: cfg.color }}
                  />
                  <span className="label-sm font-bold tracking-widest text-xs" style={{ color: cfg.color }}>
                    {cfg.label}
                  </span>
                </div>

                {isThrottled && (
                  <span className="text-[0.625rem] font-mono uppercase tracking-wider font-semibold text-[#FF7A45] border border-[#FF7A45]/30 bg-[#FF7A45]/10 rounded-full px-2 py-0.5">
                    capped
                  </span>
                )}
              </div>

              {/* Throughput */}
              <div className="flex items-baseline gap-1.5 mb-3">
                <NumberTicker
                  value={throughput}
                  decimals={2}
                  fontSize="text-4xl md:text-5xl"
                  className="font-mono text-[#F2F0EA] tracking-tight font-medium"
                />
                <span className="text-xs md:text-sm font-ui text-[#8A8880] font-normal">
                  Mbps
                </span>
              </div>

              {/* Sub-metrics */}
              <div className="flex items-center gap-2 text-xs text-[#8A8880] font-mono tracking-tight mb-6">
                <span>{latency.toFixed(0)} ms</span>
                <span className="text-[#3A3A40]">·</span>
                <span>{loss.toFixed(1)}% loss</span>
                {isThrottled && (
                  <>
                    <span className="text-[#3A3A40]">·</span>
                    <span className="text-[#FF7A45]">capped</span>
                  </>
                )}
              </div>
            </div>

            {/* Bottom Accent underline bar */}
            <div className="h-1.5 w-full rounded-full bg-[#1c1c22] overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: cfg.color }}
                initial={{ width: 0 }}
                animate={{
                  width: `${Math.min(100, Math.max(3, (throughput / 10) * 100))}%`,
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
