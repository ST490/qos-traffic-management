import { motion } from 'framer-motion';

interface FairnessPanelProps {
  jainIndex: number;
  jainDemandNormalized: number;
  utilization: number;
  adaptiveMessage?: string;
  className?: string;
}

const ADAPTIVE_THRESHOLD = 0.85;

export default function FairnessPanel({
  jainIndex,
  jainDemandNormalized,
  utilization,
  adaptiveMessage,
  className = '',
}: FairnessPanelProps) {
  const utilizationColor =
    utilization < 0.7 ? 'var(--voip)' : utilization < 0.85 ? '#FFD700' : '#FF4444';

  const defaultExplanation =
    adaptiveMessage ||
    (utilization > 0.85
      ? 'Utilisation crossed 85%, so Bulk was metered down and VoIP was promoted. Release when load stays under 70% for 10 s.'
      : 'Bottleneck capacity is distributed according to active queue disciplines with fair share guarantee.');

  return (
    <div className={`panel h-full ${className}`} data-crosshair-target>
      <div className="panel-head">
        <h3 className="panel-label">Jain&rsquo;s fairness index</h3>
        <span className="panel-note">0 – 1</span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="font-display text-[2.25rem] leading-none tracking-tight text-[var(--text)]">
          {jainIndex > 0 ? jainIndex.toFixed(2) : '1.00'}
        </span>
        <span className="font-mono text-[0.6875rem] text-[var(--text-faint)]">of 1.00</span>
      </div>

      <div className="mt-5 border-t border-[var(--border-soft)] pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="panel-label">Bottleneck utilisation</h4>
          <span className="font-mono text-xs font-medium text-[var(--text)]">
            {(utilization * 100).toFixed(0)}%
          </span>
        </div>

        <div className="relative mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: utilizationColor }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, Math.max(2, utilization * 100))}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
          <span
            className="absolute inset-y-0 w-px bg-[var(--ground)]/70"
            style={{ left: `${ADAPTIVE_THRESHOLD * 100}%` }}
            aria-hidden="true"
          />
        </div>

        <p className="mt-2 font-mono text-[0.625rem] text-[var(--text-faint)]">
          Mark at 85%: adaptive-policy trigger
        </p>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-[var(--text-dim)]">{defaultExplanation}</p>

      <div className="panel-foot">
        <span>Demand-norm {(jainDemandNormalized > 0 ? jainDemandNormalized : 1).toFixed(2)}</span>
        <span className="text-[var(--text-faint)]">across 4 classes</span>
      </div>
    </div>
  );
}
