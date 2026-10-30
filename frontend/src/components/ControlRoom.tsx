import { useState } from 'react';
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
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-5 md:gap-6" aria-label="Control Room">
      {/* Network Topology */}
      <TopologyView metrics={metrics} utilization={utilization} policy={policy} />

      {/* QoS Policy & Queue Tuning */}
      <div
        className="rounded-2xl border border-[#1f1f24] hover:border-[#2a2a32] bg-[#111114] p-7 md:p-8 flex flex-col justify-between shadow-[0_4px_24px_rgba(0,0,0,0.4)] transition-all duration-300"
        data-crosshair-target
      >
        <div>
          {/* Section Header */}
          <div className="flex items-center justify-between mb-6">
            <h3 className="label-sm text-[#8A8880] tracking-widest font-semibold text-xs">
              POLICY ENGINE & QUEUE DISCIPLINES
            </h3>
            <span className="text-xs font-mono text-[#8A8880]">Live Tuning</span>
          </div>

          {/* Quick policy tabs */}
          <div className="mb-8">
            <label className="block text-xs font-mono text-[#8A8880] mb-3">
              SWITCH SCHEDULING DISCIPLINE
            </label>
            <PolicySwitcher active={policy} onChange={onPolicyChange} disabled={disabled} />
          </div>

          {/* Per-class sliders */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-mono text-[#8A8880] uppercase tracking-wider">
                {policy === 'weighted' ? 'Fair Queue Weights (%)' : 'Bandwidth Shaping Caps (%)'}
              </h4>
              <span className="text-[0.6875rem] font-mono text-[#6A6860]">
                {policy === 'weighted' ? 'Sum: 100%' : 'Work-conserving'}
              </span>
            </div>

            <div className="space-y-3 pt-1">
              {classOrder.map((cls) => {
                const cfg = CLASS_CONFIG[cls];
                const val = policy === 'weighted' ? (localWeights[cls] ?? 25) : (localCaps[cls] ?? 100);

                return (
                  <div
                    key={cls}
                    className="flex items-center gap-3.5 p-2 rounded-xl bg-[#16161c] border border-[#1e1e26]"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: cfg.color }}
                    />
                    <span className="text-xs font-mono font-medium text-[#F2F0EA] w-14">
                      {cls.toUpperCase()}
                    </span>

                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={val}
                      onChange={(e) => {
                        const num = parseInt(e.target.value);
                        if (policy === 'weighted') {
                          handleWeightChange(cls, num);
                        } else {
                          handleCapChange(cls, num);
                        }
                      }}
                      className="flex-1 h-1.5 rounded-full appearance-none bg-[#24242e] accent-[#C6FF3D] cursor-pointer"
                      aria-label={`${cls} ${policy === 'weighted' ? 'weight' : 'cap'}`}
                      disabled={disabled}
                    />

                    <span className="text-xs font-mono text-[#F2F0EA] w-12 text-right">
                      {val}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Load readout footer */}
        <div className="mt-8 pt-4 border-t border-[#1a1a20] flex items-center justify-between text-xs font-mono text-[#8A8880]">
          <span>Bottleneck Load: {(utilization * 100).toFixed(1)}%</span>
          <span className="text-[#C6FF3D]">Runtime hot-reload: OK</span>
        </div>
      </div>
    </section>
  );
}
