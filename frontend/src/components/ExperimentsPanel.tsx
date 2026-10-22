import { useState } from 'react';
import { motion } from 'framer-motion';
import MagneticButton from './MagneticButton';
import type { RunInfo } from '../types';

const SCENARIOS = [
  {
    id: 'baseline',
    name: 'Baseline',
    description: 'All traffic at default rates with FIFO. 60 s.',
  },
  {
    id: 'congestion_ramp',
    name: 'Congestion Ramp',
    description: 'Bulk ramps 0→15 Mbps over 30 s, then holds.',
  },
  {
    id: 'mid_run_switch',
    name: 'Mid-Run Switch',
    description: 'FIFO for 30 s → Strict Priority. Shows QoS improvement.',
  },
  {
    id: 'fairness_stress',
    name: 'Fairness Stress',
    description: 'All classes demand equal bandwidth. Compare Jain\'s index.',
  },
  {
    id: 'adaptive_demo',
    name: 'Adaptive Demo',
    description: 'FIFO → ramp → Adaptive auto-engage at t=20 s.',
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
    <section className="space-y-6" aria-label="Experiments">
      {/* Scenarios */}
      <div className="glass-card p-6">
        <h3 className="label-sm mb-4">Scenarios</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {SCENARIOS.map((s) => (
            <div
              key={s.id}
              className="border border-[var(--border)] rounded-lg p-4 hover:border-[var(--text-dim)] transition-colors"
            >
              <h4 className="text-sm font-medium text-[var(--text)] mb-1 font-ui">{s.name}</h4>
              <p className="text-xs text-[var(--text-dim)] mb-3 font-ui">{s.description}</p>
              <MagneticButton
                variant="secondary"
                onClick={() => onRunScenario(s.id)}
                disabled={running}
                aria-label={`Run ${s.name}`}
              >
                {running ? 'Running…' : 'Run'}
              </MagneticButton>
            </div>
          ))}
        </div>
      </div>

      {/* Run History */}
      <div className="glass-card p-6">
        <h3 className="label-sm mb-4">Run History</h3>
        {runs.length === 0 ? (
          <p className="text-sm text-[var(--text-dim)] font-ui">No runs yet. Start a scenario above.</p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {runs.map((run) => (
              <motion.div
                key={run.run_id}
                className={`flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer ${
                  selected === run.run_id
                    ? 'border-[var(--voip)] bg-[var(--voip)]/5'
                    : 'border-[var(--border)] hover:border-[var(--text-dim)]'
                }`}
                onClick={() => {
                  setSelected(run.run_id);
                  onLoadRun(run.run_id);
                }}
                whileHover={{ scale: 1.005 }}
              >
                <div>
                  <span className="text-sm font-mono text-[var(--text)]">
                    {run.run_id.slice(0, 19)}
                  </span>
                  <div className="flex gap-2 mt-1">
                    <span className="text-[0.65rem] text-[var(--text-dim)] font-ui">
                      {run.scenario || 'manual'}
                    </span>
                    <span className="text-[0.65rem] text-[var(--text-dim)]">·</span>
                    <span className="text-[0.65rem] text-[var(--text-dim)] font-ui">
                      {run.initial_policy}
                    </span>
                    <span className="text-[0.65rem] text-[var(--text-dim)]">·</span>
                    <span className={`text-[0.65rem] font-ui ${
                      run.status === 'completed' ? 'text-[var(--voip)]' : 'text-[var(--video)]'
                    }`}>
                      {run.status}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    className="text-xs text-[var(--text-dim)] hover:text-[var(--text)] font-ui"
                    onClick={(e) => { e.stopPropagation(); onExport(run.run_id, 'csv'); }}
                    aria-label="Export CSV"
                  >
                    CSV
                  </button>
                  <button
                    className="text-xs text-[var(--text-dim)] hover:text-[var(--text)] font-ui"
                    onClick={(e) => { e.stopPropagation(); onExport(run.run_id, 'json'); }}
                    aria-label="Export JSON"
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
