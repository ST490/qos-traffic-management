import { motion, AnimatePresence } from 'framer-motion';
import type { PolicyChange } from '../types';

interface TimelineProps {
  changes: PolicyChange[];
}

export default function Timeline({ changes }: TimelineProps) {
  return (
    <div
      className="card-surface p-5 sm:p-6 min-w-0 w-full"
      data-crosshair-target
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="card-title text-xs font-semibold tracking-wider text-white/55">
          POLICY CHANGE AUDIT TRAIL
        </h3>
        <span className="text-xs font-mono text-white/40">
          {changes.length} {changes.length === 1 ? 'event' : 'events'} logged
        </span>
      </div>

      {changes.length === 0 ? (
        <div className="py-8 text-center border border-dashed border-white/10 rounded-xl">
          <p className="text-sm text-white/50 font-ui">
            No policy switch events yet. Switch policies in the navbar or launch an experiment.
          </p>
        </div>
      ) : (
        <div className="relative pl-6 border-l border-white/10 space-y-4 max-h-72 overflow-y-auto pr-2">
          <AnimatePresence>
            {changes.map((change, i) => (
              <motion.div
                key={`${change.timestamp}-${i}`}
                className="relative"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: i * 0.03 }}
              >
                {/* Timeline node */}
                <span
                  className="absolute -left-[calc(1.5rem+5px)] top-2 w-2.5 h-2.5 rounded-full bg-[#C6FF3D] shadow-[0_0_8px_#C6FF3D]"
                />

                <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <span className="font-mono text-xs text-[#C6FF3D] font-medium">
                      t = {change.elapsed_seconds}s
                    </span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-white/[0.06] text-white/90">
                      <span className="text-white/50">{change.old_policy.toUpperCase()}</span>
                      <span className="text-white/30 mx-1.5">→</span>
                      <span className="text-[#C6FF3D] font-semibold">{change.new_policy.toUpperCase()}</span>
                    </span>
                  </div>

                  <p className="text-xs text-white/70 font-ui leading-relaxed">
                    {change.reason}
                  </p>

                  {/* Weights diff if available */}
                  {change.weights_before && change.weights_after && (
                    <div className="mt-2.5 pt-2 border-t border-white/[0.06] text-[11px] font-mono text-white/50 flex flex-wrap gap-4">
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
