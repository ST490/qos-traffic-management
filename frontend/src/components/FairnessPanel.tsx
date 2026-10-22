import { motion } from 'framer-motion';
import NumberTicker from './NumberTicker';

interface FairnessPanelProps {
  jainIndex: number;
  jainDemandNormalized: number;
  utilization: number;
  adaptiveMessage?: string;
}

export default function FairnessPanel({
  jainIndex,
  utilization,
  adaptiveMessage,
}: FairnessPanelProps) {
  const utilizationColor =
    utilization < 0.7 ? 'var(--voip)' : utilization < 0.85 ? '#FFD700' : '#FF4444';

  // SVG gauge arc
  const radius = 52;
  const strokeWidth = 6;
  const circumference = Math.PI * radius; // semicircle
  const progress = Math.max(0, Math.min(1, jainIndex));
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="glass-card p-6">
      {/* Jain's Index */}
      <h3 className="label-sm mb-6">Jain's Fairness Index</h3>

      <div className="flex items-center gap-8 mb-6">
        {/* Gauge */}
        <div className="relative flex-shrink-0">
          <svg width="120" height="70" viewBox="0 0 120 70" aria-hidden="true">
            {/* Background arc */}
            <path
              d="M 10 65 A 50 50 0 0 1 110 65"
              fill="none"
              stroke="var(--border)"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
            {/* Value arc */}
            <motion.path
              d="M 10 65 A 50 50 0 0 1 110 65"
              fill="none"
              stroke="var(--voip)"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: dashOffset }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-end justify-center pb-1">
            <NumberTicker
              value={jainIndex}
              decimals={2}
              fontSize="text-2xl"
            />
          </div>
        </div>

        {/* Big number */}
        <div>
          <div className="font-display text-5xl text-[var(--text)]">
            {jainIndex.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Bottleneck Utilisation */}
      <h4 className="label-sm mb-2">Bottleneck Utilisation</h4>
      <div className="h-2 w-full rounded-full bg-[var(--border)] overflow-hidden mb-2">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: utilizationColor }}
          animate={{ width: `${Math.min(100, utilization * 100)}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
      <p className="text-xs font-mono text-[var(--text-dim)]">
        {(utilization * 100).toFixed(0)}%
      </p>

      {/* Adaptive message */}
      {adaptiveMessage && (
        <motion.p
          className="mt-4 text-xs text-[var(--text-dim)] font-ui leading-relaxed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {adaptiveMessage}
        </motion.p>
      )}
    </div>
  );
}
