const SCENARIOS = [
  {
    id: 'baseline',
    name: 'Baseline FIFO',
    badge: 'Baseline',
    description:
      'All traffic classes at default rates with FIFO discipline. Demonstrates severe bufferbloat.',
  },
  {
    id: 'congestion_ramp',
    name: 'Congestion ramp',
    badge: 'Stress',
    description: 'Bulk floods the link from 0→15 Mbps over 30 s. Tests queue collapse thresholds.',
  },
  {
    id: 'mid_run_switch',
    name: 'Mid-run policy switch',
    badge: 'Comparison',
    description:
      'FIFO for 30 s → Strict Priority. Instant comparison of the delay and loss drop.',
  },
  {
    id: 'fairness_stress',
    name: 'Fairness stress',
    badge: 'WFQ',
    description:
      'Equal 3 Mbps demand across all classes. Compares Jain’s index across queue weights.',
  },
  {
    id: 'adaptive_demo',
    name: 'Autonomous adaptive',
    badge: 'Reactive',
    description:
      'Autonomous escalation: throttles bulk when load > 85% or priority loss > 2%.',
  },
];

interface ExperimentsPanelProps {
  running: boolean;
  onRunScenario: (name: string) => void;
  className?: string;
}

export default function ExperimentsPanel({
  running,
  onRunScenario,
  className = '',
}: ExperimentsPanelProps) {
  return (
    <div className={`panel h-full ${className}`} data-crosshair-target>
      <div className="panel-head">
        <h3 className="panel-label">Automated experiment suite</h3>
        <span className="panel-note">{SCENARIOS.length} benchmarks</span>
      </div>

      {/* Rows, not cards: one scan line per benchmark, actions on the right */}
      <ul className="-mt-3 divide-y divide-[var(--border-soft)]">
        {SCENARIOS.map((s) => (
          <li
            key={s.id}
            className="flex flex-col gap-2.5 py-3.5 sm:flex-row sm:items-center sm:gap-5"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h4 className="text-sm font-semibold text-[var(--text)]">{s.name}</h4>
                <span className="rounded-full border border-[var(--border)] px-1.5 py-0.5 font-mono text-[0.625rem] uppercase tracking-wide text-[var(--text-faint)]">
                  {s.badge}
                </span>
              </div>
              <p className="mt-1 max-w-[62ch] text-xs leading-relaxed text-[var(--text-dim)]">
                {s.description}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onRunScenario(s.id)}
              disabled={running}
              className={`shrink-0 rounded-lg border px-3 py-2 font-mono text-xs transition-colors duration-200 ${
                running
                  ? 'cursor-not-allowed border-[var(--border-soft)] bg-[var(--surface-2)] text-[var(--text-faint)] opacity-60'
                  : 'cursor-pointer border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text)] hover:border-[var(--voip)] hover:text-[var(--voip)]'
              }`}
            >
              {running ? 'Running…' : 'Run →'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
