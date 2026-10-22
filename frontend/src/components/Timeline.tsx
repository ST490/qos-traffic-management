import { motion, AnimatePresence } from 'framer-motion';
import type { PolicyChange } from '../types';

interface TimelineProps {
  changes: PolicyChange[];
}

export default function Timeline({ changes }: TimelineProps) {
  return (
    <div className="glass-card p-6">
      <h3 className="label-sm mb-6">Policy Change Timeline</h3>

      {changes.length === 0 ? (
        <p className="text-sm text-[var(--text-dim)] font-ui">No policy changes yet.</p>
      ) : (
        <div className="relative pl-6 border-l border-[var(--border)] space-y-6 max-h-80 overflow-y-auto">
          <AnimatePresence>
            {changes.map((change, i) => (
              <motion.div
                key={`${change.timestamp}-${i}`}
                className="relative"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
              >
                {/* Dot */}
                <span
                  className="absolute -left-[calc(1.5rem+5px)] top-1 w-2.5 h-2.5 rounded-full bg-[var(--voip)]"
                />

                {/* Content */}
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-mono text-xs text-[var(--text-dim)]">
                      t={change.elapsed_seconds}s
                    </span>
                    <span className="text-sm font-ui">
                      <span className="text-[var(--text-dim)]">{change.old_policy.toUpperCase()}</span>
                      <span className="text-[var(--text-dim)] mx-2">→</span>
                      <span className="text-[var(--text)] font-medium">{change.new_policy.toUpperCase()}</span>
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-dim)] font-ui">{change.reason}</p>

                  {/* Weights diff */}
                  {change.weights_before && change.weights_after && (
                    <div className="mt-2 text-[0.65rem] font-mono text-[var(--text-dim)] flex gap-4">
                      <span>Before: {JSON.stringify(change.weights_before)}</span>
                      <span>After: {JSON.stringify(change.weights_after)}</span>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
