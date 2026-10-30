import { motion } from 'framer-motion';
import NumberTicker from './NumberTicker';
import type { ClassMetrics, TrafficClass } from '../types';
import { CLASS_CONFIG } from '../types';

interface ClassCardsProps {
  metrics: Record<TrafficClass, ClassMetrics>;
  throttled?: TrafficClass[];
  className?: string;
}

const order: TrafficClass[] = ['voip', 'video', 'web', 'bulk'];

export default function ClassCards({ metrics, throttled = [], className = '' }: ClassCardsProps) {
  return (
    <section
      className={`panel panel-flush ${className}`}
      aria-label="Traffic class metrics"
    >
      <div className="hairline-grid grid-cols-2 lg:grid-cols-4">
        {order.map((cls, i) => {
          const cfg = CLASS_CONFIG[cls];
          const m = metrics[cls];
          const isThrottled = throttled.includes(cls);
          const throughput = m?.throughput_mbps ?? 0;
          const latency = m?.latency_avg_ms ?? 0;
          const loss = m?.loss_percent ?? 0;

          return (
            <div
              key={cls}
              className="flex flex-col p-[var(--panel-pad)]"
              data-crosshair-target
            >
              {/* Class identity */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full shadow-[0_0_6px_currentColor]"
                    style={{ backgroundColor: cfg.color, color: cfg.color }}
                    aria-hidden="true"
                  />
                  <span
                    className="panel-label truncate"
                    style={{ color: cfg.color }}
                    title={cfg.label}
                  >
                    {cfg.label}
                  </span>
                </div>

                {isThrottled && (
                  <span className="shrink-0 rounded-full border border-[var(--video)]/30 bg-[var(--video)]/10 px-1.5 py-0.5 font-mono text-[0.625rem] uppercase tracking-wide text-[var(--video)]">
                    capped
                  </span>
                )}
              </div>

              {/* Primary measure */}
              <div className="mt-3 flex items-baseline gap-1.5">
                <NumberTicker
                  value={throughput}
                  decimals={2}
                  fontSize="text-3xl sm:text-4xl"
                  className="font-mono font-medium tracking-tight text-[var(--text)]"
                />
                <span className="font-ui text-[0.6875rem] text-[var(--text-dim)]">Mbps</span>
              </div>

              {/* Supporting measures */}
              <div className="mt-1 flex items-center gap-1.5 font-mono text-[0.6875rem] tracking-tight text-[var(--text-dim)]">
                <span>{latency.toFixed(0)} ms</span>
                <span className="text-[var(--border-strong)]" aria-hidden="true">
                  ·
                </span>
                <span>{loss.toFixed(1)}% loss</span>
              </div>

              {/* Share of the bottleneck link */}
              <div className="mt-4 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: cfg.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, Math.max(2, (throughput / 10) * 100))}%` }}
                    transition={{ duration: 0.5, delay: i * 0.06, ease: 'easeOut' }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right font-mono text-[0.625rem] text-[var(--text-faint)]">
                  {Math.min(100, Math.round((throughput / 10) * 100))}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
