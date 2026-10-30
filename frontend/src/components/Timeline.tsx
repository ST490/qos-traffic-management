import { motion, AnimatePresence } from 'framer-motion';
import type { PolicyChange } from '../types';

interface TimelineProps {
  changes: PolicyChange[];
}

export default function Timeline({ changes }: TimelineProps) {
  return (
    <div
      className="rounded-2xl border border-[#1f1f24] hover:border-[#2a2a32] bg-[#111114] p-7 md:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.4)] transition-all duration-300"
      data-crosshair-target
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="label-sm text-[#8A8880] tracking-widest font-semibold text-xs">
          POLICY CHANGE AUDIT TRAIL
        </h3>
        <span className="text-xs font-mono text-[#8A8880]">
          {changes.length} {changes.length === 1 ? 'event' : 'events'} logged
        </span>
      </div>

      {changes.length === 0 ? (
        <div className="py-8 text-center border border-dashed border-[#222228] rounded-xl">
          <p className="text-sm text-[#8A8880] font-ui">
            No policy switch events yet. Switch policies in the navbar or run an experiment.
          </p>
        </div>
      ) : (
        <div className="relative pl-6 border-l border-[#23232b] space-y-6 max-h-72 overflow-y-auto pr-2">
          <AnimatePresence>
            {changes.map((change, i) => (
              <motion.div
                key={`${change.timestamp}-${i}`}
                className="relative"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: i * 0.04 }}
              >
                {/* Timeline node */}
                <span
                  className="absolute -left-[calc(1.5rem+5px)] top-1 w-2.5 h-2.5 rounded-full bg-[#C6FF3D] shadow-[0_0_8px_#C6FF3D]"
                />

                <div className="bg-[#15151c] border border-[#202028] rounded-xl p-4">
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <span className="font-mono text-xs text-[#C6FF3D] font-medium">
                      t = {change.elapsed_seconds}s
                    </span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#1e1e28] text-[#F2F0EA]">
                      <span className="text-[#8A8880]">{change.old_policy.toUpperCase()}</span>
                      <span className="text-[#6A6860] mx-1.5">→</span>
                      <span className="text-[#C6FF3D] font-semibold">{change.new_policy.toUpperCase()}</span>
                    </span>
                  </div>

                  <p className="text-xs text-[#C4C2B8] font-ui leading-relaxed">
                    {change.reason}
                  </p>

                  {/* Weights diff if available */}
                  {change.weights_before && change.weights_after && (
                    <div className="mt-2.5 pt-2 border-t border-[#20202a] text-[0.6875rem] font-mono text-[#8A8880] flex flex-wrap gap-4">
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
