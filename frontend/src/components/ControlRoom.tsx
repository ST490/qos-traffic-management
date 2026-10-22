import { useState } from 'react';
import { motion } from 'framer-motion';
import TopologyView from './TopologyView';
import PolicySwitcher from './PolicySwitcher';
import type { PolicyMode, TrafficClass, ClassMetrics } from '../types';
import { CLASS_CONFIG } from '../types';

const classOrder: TrafficClass[] = ['voip', 'video', 'web', 'bulk'];

interface ControlRoomProps {
  policy: PolicyMode;
  metrics: Record<TrafficClass, ClassMetrics>;
  utilization: number;
  weights: Record<TrafficClass, number>;
  caps: Record<TrafficClass, number>;
  onPolicyChange: (mode: PolicyMode) => void;
  onWeightsChange: (weights: Record<TrafficClass, number>) => void;
  onCapsChange: (caps: Record<TrafficClass, number>) => void;
  disabled?: boolean;
}

export default function ControlRoom({
  policy,
  metrics,
  utilization,
  weights,
  caps,
  onPolicyChange,
  onWeightsChange,
  onCapsChange,
  disabled,
}: ControlRoomProps) {
  const [localWeights, setLocalWeights] = useState(weights);
  const [localCaps, setLocalCaps] = useState(caps);

  const handleWeightChange = (cls: TrafficClass, val: number) => {
    const updated = { ...localWeights, [cls]: val };
    setLocalWeights(updated);
    onWeightsChange(updated);
  };

  const handleCapChange = (cls: TrafficClass, val: number) => {
    const updated = { ...localCaps, [cls]: val };
    setLocalCaps(updated);
    onCapsChange(updated);
  };

  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-4" aria-label="Control Room">
      {/* Topology */}
      <TopologyView metrics={metrics} utilization={utilization} policy={policy} />

      {/* Controls */}
      <div className="glass-card p-6 space-y-6">
        <div>
          <h3 className="label-sm mb-3">Active Policy</h3>
          <PolicySwitcher active={policy} onChange={onPolicyChange} disabled={disabled} />
        </div>

        {/* Per-class sliders */}
        <motion.div
          className="space-y-4"
          initial={false}
          animate={{ height: 'auto', opacity: 1 }}
        >
          <h4 className="label-sm">
            {policy === 'weighted' ? 'Weights (%)' : 'Bandwidth Caps (%)'}
          </h4>
          {classOrder.map((cls) => (
            <div key={cls} className="flex items-center gap-3">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: CLASS_CONFIG[cls].color }}
              />
              <span className="text-xs font-ui text-[var(--text-dim)] w-12">
                {cls.toUpperCase()}
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={policy === 'weighted' ? (localWeights[cls] ?? 25) : (localCaps[cls] ?? 100)}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (policy === 'weighted') {
                    handleWeightChange(cls, val);
                  } else {
                    handleCapChange(cls, val);
                  }
                }}
                className="flex-1 h-1 rounded-full appearance-none bg-[var(--border)] accent-[var(--voip)]"
                aria-label={`${cls} ${policy === 'weighted' ? 'weight' : 'cap'}`}
                disabled={disabled}
              />
              <span className="text-xs font-mono text-[var(--text)] w-10 text-right">
                {policy === 'weighted' ? (localWeights[cls] ?? 25) : (localCaps[cls] ?? 100)}%
              </span>
            </div>
          ))}
        </motion.div>

        {/* Utilisation mini-gauge */}
        <div>
          <h4 className="label-sm mb-2">Bottleneck Load</h4>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-[var(--border)] overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{
                  backgroundColor:
                    utilization < 0.7 ? 'var(--voip)' : utilization < 0.85 ? '#FFD700' : '#FF4444',
                }}
                animate={{ width: `${Math.min(100, utilization * 100)}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <span className="text-xs font-mono text-[var(--text)]">
              {(utilization * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
