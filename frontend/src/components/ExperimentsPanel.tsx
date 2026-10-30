import { useState } from 'react';
import { motion } from 'framer-motion';
import type { RunInfo } from '../types';

const SCENARIOS = [
  {
    id: 'baseline',
    name: 'Baseline FIFO',
    badge: 'Baseline',
    description: 'All traffic classes at default rates with FIFO discipline. Demonstrates severe bufferbloat.',
  },
  {
    id: 'congestion_ramp',
    name: 'Congestion Ramp',
    badge: 'Stress',
    description: 'Bulk floods link from 0→15 Mbps over 30s. Tests queue collapse thresholds.',
  },
  {
    id: 'mid_run_switch',
    name: 'Mid-Run Policy Switch',
    badge: 'Comparison',
    description: 'FIFO for 30s → Strict Priority. Instant visual comparison of delay and loss drop.',
  },
  {
    id: 'fairness_stress',
    name: 'Fairness Stress',
    badge: 'WFQ',
    description: 'Equal 3 Mbps demand across all classes. Compares Jain’s index across queue weights.',
  },
  {
    id: 'adaptive_demo',
    name: 'Autonomous Adaptive',
    badge: 'Reactive',
    description: 'Autonomous policy escalation: throttles bulk when load >85% or priority loss >2%.',
  },
];

interface ExperimentsPanelProps {
  runs: RunInfo[];
  running: boolean;
  onRunScenario: (name: string) => void;
  onExport: (runId: string, format: 'csv' | 'json') => void;
  onLoadRun: (runId: string) => void;
}

export default function ExperimentsPanel({
  runs,
  running,
  onRunScenario,
  onExport,
  onLoadRun,
}: ExperimentsPanelProps) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <section className="space-y-6 w-full min-w-0" aria-label="Experiments">
      {/* Scenario launcher */}
      <div
        className="card-surface p-5 sm:p-6 min-w-0 w-full"
        data-crosshair-target
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="card-title text-xs font-semibold tracking-wider text-white/55">
            AUTOMATED EXPERIMENT SUITE
          </h3>
          <span className="text-xs font-mono text-white/40">5 Preconfigured Benchmarks</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {SCENARIOS.map((s) => (
            <div
              key={s.id}
              className="border border-white/[0.06] rounded-xl p-5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/15 transition-all duration-150 flex flex-col justify-between"
              data-crosshair-target
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h4 className="text-sm font-semibold text-white/90 font-ui">{s.name}</h4>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border border-white/10 text-white/60">
                    {s.badge}
                  </span>
                </div>
                <p className="text-xs text-white/60 font-ui leading-relaxed mb-5">{s.description}</p>
              </div>

              <button
                onClick={() => onRunScenario(s.id)}
                disabled={running}
                data-crosshair-target
                className={`w-full py-2 px-3 rounded-lg text-xs font-mono font-medium transition-all duration-150 cursor-pointer ${
                  running
                    ? 'opacity-40 bg-white/5 text-white/40 cursor-not-allowed'
                    : 'bg-white/5 hover:bg-[#C6FF3D] text-white/90 hover:text-[#0A0B0E] border border-white/10 hover:border-[#C6FF3D]'
                }`}
              >
                {running ? 'Benchmark in progress…' : `Run ${s.name} →`}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Run Telemetry History */}
      <div
        className="card-surface p-5 sm:p-6 min-w-0 w-full"
        data-crosshair-target
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="card-title text-xs font-semibold tracking-wider text-white/55">
            RUN REPOSITORY & DATA EXPORTS
          </h3>
          <span className="text-xs font-mono text-white/40">SQLite Telemetry Storage</span>
        </div>

        {runs.length === 0 ? (
          <div className="py-8 text-center border border-dashed border-white/10 rounded-xl">
            <p className="text-sm text-white/50 font-ui">
              No historical runs found yet. Launch a scenario above to record telemetry.
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {runs.map((run) => (
              <motion.div
                key={run.run_id}
                className={`flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border transition-all cursor-pointer ${
                  selected === run.run_id
                    ? 'border-[#C6FF3D] bg-[#C6FF3D]/5'
                    : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15'
                }`}
                onClick={() => {
                  setSelected(run.run_id);
                  onLoadRun(run.run_id);
                }}
                whileHover={{ scale: 1.001 }}
                data-crosshair-target
              >
                <div>
                  <span className="text-xs font-mono font-medium text-white/90">
                    {run.run_id}
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] text-white/50 font-mono">
                      {run.scenario || 'live'}
                    </span>
                    <span className="text-white/20">·</span>
                    <span className="text-[11px] text-white/50 font-mono">
                      {run.initial_policy.toUpperCase()}
                    </span>
                    <span className="text-white/20">·</span>
                    <span
                      className={`text-[11px] font-mono ${
                        run.status === 'completed' ? 'text-[#C6FF3D]' : 'text-[#FF7A45]'
                      }`}
                    >
                      {run.status}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    className="text-xs font-mono px-3 py-1 rounded-md bg-white/[0.04] border border-white/10 text-white/70 hover:text-white hover:border-white/25 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      onExport(run.run_id, 'csv');
                    }}
                    aria-label="Export CSV"
                    data-crosshair-target
                  >
                    CSV
                  </button>
                  <button
                    className="text-xs font-mono px-3 py-1 rounded-md bg-white/[0.04] border border-white/10 text-white/70 hover:text-white hover:border-white/25 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      onExport(run.run_id, 'json');
                    }}
                    aria-label="Export JSON"
                    data-crosshair-target
                  >
                    JSON
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
