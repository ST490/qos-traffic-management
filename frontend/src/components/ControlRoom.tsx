import { useState } from 'react';
import type { TrafficClass, ClassMetrics } from '../types';
import { CLASS_CONFIG } from '../types';

const classOrder: TrafficClass[] = ['voip', 'video', 'web', 'bulk'];

interface ControlRoomProps {
  policy: string;
  metrics: Record<TrafficClass, ClassMetrics>;
  utilization: number;
  weights: Record<TrafficClass, number>;
  caps: Record<TrafficClass, number>;
  onWeightsChange: (weights: Record<TrafficClass, number>) => void;
  onCapsChange: (caps: Record<TrafficClass, number>) => void;
  disabled?: boolean;
  className?: string;
}

export default function ControlRoom({
  policy,
  metrics,
  utilization,
  weights,
  caps,
  onWeightsChange,
  onCapsChange,
  disabled,
  className = '',
}: ControlRoomProps) {
  const [localWeights, setLocalWeights] = useState(weights);
  const [localCaps, setLocalCaps] = useState(caps);

  const isWeighted = policy === 'weighted';

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
    <div className={`panel h-full ${className}`} data-crosshair-target>
      <div className="panel-head">
        <h3 className="panel-label">Queue weights &amp; shaping caps</h3>
        <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 font-mono text-[0.6875rem] text-[var(--text)]">
          {policy.toUpperCase()} active
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <h4 className="panel-label text-[var(--text-faint)]">
          {isWeighted ? 'Fair queue weights (%)' : 'Bandwidth shaping caps (%)'}
        </h4>
        <span className="font-mono text-[0.6875rem] text-[var(--text-faint)]">
          {isWeighted ? 'sum: 100%' : 'work-conserving'}
        </span>
      </div>

      {/* One row per class, divided rather than boxed — no cards inside the panel */}
      <div className="mt-2 divide-y divide-[var(--border-soft)]">
        {classOrder.map((cls) => {
          const cfg = CLASS_CONFIG[cls];
          const val = isWeighted ? (localWeights[cls] ?? 25) : (localCaps[cls] ?? 100);
          const share = metrics[cls]?.throughput_mbps ?? 0;

          return (
            <div key={cls} className="flex items-center gap-3 py-4">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: cfg.color }}
                aria-hidden="true"
              />

              <span className="w-11 shrink-0 font-mono text-[0.6875rem] font-medium text-[var(--text)]">
                {cls.toUpperCase()}
              </span>

              <input
                type="range"
                min={0}
                max={100}
                value={val}
                onChange={(e) => {
                  const num = parseInt(e.target.value);
                  if (isWeighted) {
                    handleWeightChange(cls, num);
                  } else {
                    handleCapChange(cls, num);
                  }
                }}
                className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-[var(--surface-3)] accent-[var(--voip)]"
                aria-label={`${cls} ${isWeighted ? 'weight' : 'cap'}`}
                disabled={disabled}
              />

              <span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-[var(--text)]">
                {val}%
              </span>

              <span className="w-14 shrink-0 text-right font-mono text-[0.625rem] tabular-nums text-[var(--text-faint)]">
                {share.toFixed(1)} Mbps
              </span>
            </div>
          );
        })}
      </div>

      <div className="panel-foot">
        <span>Bottleneck load {(utilization * 100).toFixed(1)}%</span>
        <span className="text-[var(--voip)]">Hot-reload OK</span>
      </div>
    </div>
  );
}
