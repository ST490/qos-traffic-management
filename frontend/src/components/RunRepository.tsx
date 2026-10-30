import { useState } from 'react';
import type { RunInfo } from '../types';

interface RunRepositoryProps {
  runs: RunInfo[];
  onExport: (runId: string, format: 'csv' | 'json') => void;
  onLoadRun: (runId: string) => void;
  className?: string;
}

const COLUMNS = ['Run', 'Scenario', 'Policy', 'Duration', 'Status'] as const;

export default function RunRepository({
  runs,
  onExport,
  onLoadRun,
  className = '',
}: RunRepositoryProps) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className={`panel ${className}`} data-crosshair-target>
      <div className="panel-head">
        <h3 className="panel-label">Run repository &amp; exports</h3>
        <span className="panel-note">
          SQLite · {runs.length} {runs.length === 1 ? 'run' : 'runs'}
        </span>
      </div>

      {runs.length === 0 ? (
        <div className="grid place-items-center rounded-[var(--radius-tile)] border border-dashed border-[var(--border)] px-4 py-10 text-center">
          <p className="max-w-[52ch] text-xs leading-relaxed text-[var(--text-dim)]">
            No historical runs recorded yet. Launch a benchmark above and its telemetry
            lands here, ready to export as CSV or JSON.
          </p>
        </div>
      ) : (
        <div className="scroll-area overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--border)]">
                {COLUMNS.map((c) => (
                  <th
                    key={c}
                    scope="col"
                    className="sticky top-0 bg-[var(--surface)] pb-2 pr-4 font-ui text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]"
                  >
                    {c}
                  </th>
                ))}
                <th
                  scope="col"
                  className="sticky top-0 bg-[var(--surface)] pb-2 text-right font-ui text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]"
                >
                  Export
                </th>
              </tr>
            </thead>

            <tbody>
              {runs.map((run) => {
                const active = selected === run.run_id;
                return (
                  <tr
                    key={run.run_id}
                    tabIndex={0}
                    aria-selected={active}
                    onClick={() => {
                      setSelected(run.run_id);
                      onLoadRun(run.run_id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelected(run.run_id);
                        onLoadRun(run.run_id);
                      }
                    }}
                    className={`cursor-pointer border-b border-[var(--border-soft)] outline-offset-[-2px] transition-colors last:border-0 ${
                      active ? 'bg-[var(--voip)]/[0.06]' : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    <td className="max-w-[18ch] truncate py-2.5 pr-4 font-mono text-xs text-[var(--text)]">
                      {run.run_id}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs text-[var(--text-dim)]">
                      {run.scenario || 'live'}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs uppercase text-[var(--text-dim)]">
                      {run.initial_policy}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs tabular-nums text-[var(--text-dim)]">
                      {run.duration_seconds ? `${Math.round(run.duration_seconds)}s` : '—'}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={`inline-flex items-center gap-1.5 font-mono text-xs ${
                          run.status === 'completed'
                            ? 'text-[var(--voip)]'
                            : 'text-[var(--video)]'
                        }`}
                      >
                        <span
                          className="h-1 w-1 rounded-full bg-current"
                          aria-hidden="true"
                        />
                        {run.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="inline-flex gap-1.5">
                        {(['csv', 'json'] as const).map((fmt) => (
                          <button
                            key={fmt}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onExport(run.run_id, fmt);
                            }}
                            className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 font-mono text-[0.625rem] uppercase text-[var(--text-dim)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                            aria-label={`Export ${run.run_id} as ${fmt.toUpperCase()}`}
                          >
                            {fmt}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
