import { motion } from 'framer-motion';

interface FairnessPanelProps {
  jainIndex: number;
  jainDemandNormalized: number;
  utilization: number;
  adaptiveMessage?: string;
}

export default function FairnessPanel({
  jainIndex,
  jainDemandNormalized,
  utilization,
  adaptiveMessage,
}: FairnessPanelProps) {
  const defaultExplanation =
    adaptiveMessage ||
    (utilization > 0.85
      ? 'Utilisation crossed 85%, so Bulk was metered down and VoIP was promoted. Release when load stays under 70% for 10 s.'
      : 'Bottleneck capacity is dynamically allocated across queues to guarantee strict voice SLA while preserving fair bandwidth sharing.');

  return (
    <div
      className="card-surface p-5 sm:p-6 flex flex-col justify-between h-full min-w-0 w-full"
      data-crosshair-target
    >
      <div>
        {/* Title: 12px uppercase tracking 0.08em */}
        <h3 className="card-title text-xs font-semibold tracking-wider text-white/55 mb-4">
          JAIN'S FAIRNESS INDEX
        </h3>

        {/* Big metric number + caption */}
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-6">
          <div className="font-display text-[48px] sm:text-[56px] leading-none font-normal text-[#F3F4F6] tabular-nums">
            {jainIndex > 0 ? jainIndex.toFixed(2) : '1.00'}
          </div>
          <div className="text-[13px] font-mono text-white/50">
            Demand-normalised: {(jainDemandNormalized > 0 ? jainDemandNormalized : 1).toFixed(2)}
          </div>
        </div>

        {/* Stacked sub-section: Bottleneck Utilisation */}
        <div className="space-y-3 pt-2 border-t border-white/[0.06]">
          <div className="flex items-center justify-between">
            <h4 className="card-title text-xs font-semibold tracking-wider text-white/55">
              BOTTLENECK UTILISATION
            </h4>
            <span className="font-mono text-[13px] text-white/90 font-medium tabular-nums">
              {(utilization * 100).toFixed(0)}%
            </span>
          </div>

          {/* Bar height 10px, fully rounded, amber gradient */}
          <div className="h-[10px] w-full rounded-full bg-white/[0.06] overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-[#F59E0B] to-[#FBBF24]"
              animate={{ width: `${Math.min(100, Math.max(2, utilization * 100))}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>

          {/* Description sitting naturally right under the bar instead of floating */}
          <p className="text-[14px] leading-relaxed text-white/60 font-ui pt-2">
            {defaultExplanation}
          </p>
        </div>
      </div>

      {/* Card footer row pinned with subtle top divider */}
      <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center justify-between text-xs font-mono text-white/40">
        <span>Target Threshold: 85.0%</span>
        <span>Hysteresis: 10s @ &lt;70%</span>
      </div>
    </div>
  );
}
