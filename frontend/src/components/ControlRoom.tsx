import { useState, useEffect } from 'react';
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

  // Sync state when props arrive via WebSocket
  useEffect(() => {
    if (weights && Object.keys(weights).length > 0) {
      setLocalWeights(weights);
    }
  }, [weights]);

  useEffect(() => {
    if (caps && Object.keys(caps).length > 0) {
      setLocalCaps(caps);
    }
  }, [caps]);

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
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full min-w-0" aria-label="Control Room">
      {/* Network Topology */}
      <TopologyView metrics={metrics} utilization={utilization} policy={policy} />

      {/* QoS Policy Engine & Queue Tuning */}
      <div
        className="card-surface p-5 sm:p-6 flex flex-col justify-between h-full min-w-0 w-full"
        data-crosshair-target
      >
        <div>
          {/* Card Title */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="card-title text-xs font-semibold tracking-wider text-white/55">
              POLICY ENGINE & QUEUE CONFIGURATION
            </h3>
            <span className="text-xs font-mono text-white/40">OpenFlow 1.3</span>
          </div>

          {/* Scheduling Tabs Section */}
          <div className="mb-6">
            <label className="block text-xs font-mono text-white/50 uppercase tracking-wider mb-2.5">
              ACTIVE SCHEDULING POLICY
            </label>
            <PolicySwitcher active={policy} onChange={onPolicyChange} disabled={disabled} />
          </div>

          {/* Queue Weight Rows */}
          <div className="space-y-3 pt-2 border-t border-white/[0.06]">
            <div className="flex items-center justify-between">
              <h4 className="card-title text-xs font-semibold tracking-wider text-white/55">
                {policy === 'weighted' ? 'WEIGHTED FAIR QUEUE ALLOCATION' : 'CLASS BANDWIDTH SHAPING CAPS'}
              </h4>
              <span className="text-xs font-mono text-white/40">
                {policy === 'weighted' ? 'Weights (%)' : 'Hard Caps (%)'}
              </span>
            </div>

            <div className="space-y-1 pt-1">
              {classOrder.map((cls) => {
                const cfg = CLASS_CONFIG[cls];
                const rawVal = policy === 'weighted' ? localWeights[cls] : localCaps[cls];
                // Support both 0-100 and 0-1 values seamlessly
                const val = rawVal !== undefined
                  ? rawVal <= 1 && rawVal > 0
                    ? Math.round(rawVal * 100)
                    : Math.round(rawVal)
                  : (policy === 'weighted' ? 25 : 100);

                const fillStyle = {
                  background: `linear-gradient(to right, ${cfg.color} 0%, ${cfg.color} ${val}%, rgba(255,255,255,0.08) ${val}%, rgba(255,255,255,0.08) 100%)`,
                };

                return (
                  <div
                    key={cls}
                    className="h-[44px] grid grid-cols-[84px_1fr_48px] items-center gap-4 px-3 rounded-lg bg-white/[0.02] border border-white/[0.04]"
                  >
                    {/* Label with dot */}
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: cfg.color }}
                      />
                      <span className="text-xs font-mono font-medium text-white/90 truncate">
                        {cls.toUpperCase()}
                      </span>
                    </div>

                    {/* Range Slider with filled class color track and 16px thumb */}
                    <div className="flex items-center w-full min-w-0">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={val}
                        style={fillStyle}
                        onChange={(e) => {
                          const num = parseInt(e.target.value);
                          if (policy === 'weighted') {
                            handleWeightChange(cls, num);
                          } else {
                            handleCapChange(cls, num);
                          }
                        }}
                        className="range-slider cursor-pointer"
                        aria-label={`${cls} ${policy === 'weighted' ? 'weight' : 'cap'}`}
                        disabled={disabled}
                      />
                    </div>

                    {/* Tabular Value */}
                    <span className="text-[13px] font-mono text-white/90 tabular-nums font-medium text-right">
                      {val}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Card footer pinned to bottom with 16px top padding and subtle top divider */}
        <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center justify-between text-xs font-mono text-white/45">
          <span>Bottleneck Load: {(utilization * 100).toFixed(1)}%</span>
          <span className="text-[#C6FF3D]">Runtime hot-reload: Active</span>
        </div>
      </div>
    </section>
  );
}
