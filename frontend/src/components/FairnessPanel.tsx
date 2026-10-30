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
  const utilizationColor =
    utilization < 0.7 ? '#C6FF3D' : utilization < 0.85 ? '#FFD700' : '#FF4444';

  const defaultExplanation =
    adaptiveMessage ||
    (utilization > 0.85
      ? 'Utilisation crossed 85%, so Bulk was metered down and VoIP was promoted. Release when load stays under 70% for 10 s.'
      : 'Bottleneck capacity is distributed according to active queue disciplines with fair share guarantee.');

  return (
    <div
      className="rounded-2xl border border-[#1f1f24] hover:border-[#2a2a32] bg-[#111114] p-7 md:p-8 flex flex-col justify-between shadow-[0_4px_24px_rgba(0,0,0,0.4)] transition-all duration-300"
      data-crosshair-target
    >
      <div>
        {/* Jain's Index Header */}
        <h3 className="label-sm text-[#8A8880] tracking-widest font-semibold text-xs mb-3">
          JAIN'S FAIRNESS INDEX
        </h3>

        {/* Big Serif Number */}
        <div className="flex items-baseline gap-4 my-2">
          <div className="font-display text-6xl md:text-7xl font-normal text-[#F2F0EA] tracking-tight leading-none">
            {jainIndex > 0 ? jainIndex.toFixed(2) : '1.00'}
          </div>
          <div className="text-xs font-mono text-[#8A8880]">
            Demand-norm: {(jainDemandNormalized > 0 ? jainDemandNormalized : 1).toFixed(2)}
          </div>
        </div>

        {/* Bottleneck Utilisation Header */}
        <div className="mt-8 mb-2 flex items-center justify-between">
          <h4 className="label-sm text-[#8A8880] tracking-widest font-semibold text-xs">
            BOTTLENECK UTILISATION
          </h4>
          <span className="font-mono text-xs text-[#F2F0EA] font-medium">
            {(utilization * 100).toFixed(0)}%
          </span>
        </div>

        {/* Utilisation Bar */}
        <div className="h-2.5 w-full rounded-full bg-[#1c1c22] overflow-hidden my-3">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: utilizationColor }}
            animate={{ width: `${Math.min(100, Math.max(2, utilization * 100))}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Adaptive explanation */}
      <motion.p
        className="mt-6 text-xs md:text-sm text-[#8A8880] font-ui leading-relaxed"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        {defaultExplanation}
      </motion.p>
    </div>
  );
}
