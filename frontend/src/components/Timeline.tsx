import { motion, AnimatePresence } from 'framer-motion';
import type { PolicyChange } from '../types';

interface TimelineProps {
  changes: PolicyChange[];
  className?: string;
}

const CLASS_ORDER = ['voip', 'video', 'web', 'bulk'] as const;

/** Compact one-line weight signature — far narrower than raw JSON. */
function weights(w: Record<string, number>) {
  return CLASS_ORDER.map((c) => w[c] ?? 0).join(' / ');
}

export default function Timeline({ changes, className = '' }: TimelineProps) {
  return (
    <div className={`panel h-full ${className}`} data-crosshair-target>
      <div className="panel-head">
        <h3 className="panel-label">Policy audit trail</h3>
        <span className="panel-note">
          {changes.length} {changes.length === 1 ? 'event' : 'events'}
        </span>
      </div>

      {changes.length === 0 ? (
        <div className="grid flex-1 place-items-center rounded-[var(--radius-tile)] border border-dashed border-[var(--border)] px-4 py-8 text-center">
          <p className="text-xs leading-relaxed text-[var(--text-dim)]">
            No policy switch events yet. Switch discipline in the header, or run an
            experiment below.
          </p>
        </div>
      ) : (
        <div className="scroll-area">
          <AnimatePresence initial={false}>
            {changes.map((change, i) => (
              <motion.div
                key={`${change.timestamp}-${i}`}
                className="border-b border-[var(--border-soft)] py-3 first:pt-0 last:border-0 last:pb-0"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(i, 6) * 0.03 }}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-[0.6875rem] tabular-nums text-[var(--voip)]">
                    t = {change.elapsed_seconds}s
                  </span>
                  <span className="font-mono text-[0.625rem] uppercase tracking-wide">
                    <span className="text-[var(--text-faint)]">
                      {change.old_policy.toUpperCase()}
                    </span>
                    <span className="mx-1 text-[var(--text-faint)]" aria-hidden="true">
                      →
                    </span>
                    <span className="font-semibold text-[var(--text)]">
                      {change.new_policy.toUpperCase()}
                    </span>
                  </span>
                </div>

                <p className="mt-1 text-xs leading-relaxed text-[#c4c2b8]">{change.reason}</p>

                {change.weights_before && change.weights_after && (
                  <p className="mt-1.5 break-words font-mono text-[0.625rem] text-[var(--text-faint)]">
                    weights {weights(change.weights_before)}
                    <span aria-hidden="true"> → </span>
                    {weights(change.weights_after)}
                  </p>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
