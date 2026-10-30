import { motion } from 'framer-motion';
import type { PolicyMode } from '../types';

const policies: { id: PolicyMode; label: string }[] = [
  { id: 'fifo', label: 'FIFO' },
  { id: 'priority', label: 'Priority' },
  { id: 'weighted', label: 'Weighted' },
  { id: 'adaptive', label: 'Adaptive' },
];

interface PolicySwitcherProps {
  active: PolicyMode;
  onChange: (mode: PolicyMode) => void;
  /** Unique per mounted instance — prevents two indicators sharing a layout animation. */
  id: string;
  /** `pill` sits in the header; `full` fills its container on small screens. */
  variant?: 'pill' | 'full';
  disabled?: boolean;
  className?: string;
}

export default function PolicySwitcher({
  active,
  onChange,
  id,
  variant = 'pill',
  disabled,
  className = '',
}: PolicySwitcherProps) {
  const full = variant === 'full';

  return (
    <div
      className={`${
        full ? 'grid w-full grid-cols-4' : 'inline-flex'
      } items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] p-1 ${className}`}
      role="tablist"
      aria-label="QoS scheduling discipline"
    >
      {policies.map((p) => {
        const isActive = active === p.id;
        const isAdaptive = p.id === 'adaptive';

        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            data-crosshair-target
            className={`relative select-none rounded-full font-ui font-medium transition-colors duration-200 ${
              full ? 'w-full px-2 py-2 text-xs' : 'px-3.5 py-1.5 text-xs'
            } ${
              isActive
                ? 'font-semibold text-[#0b0b0c]'
                : 'text-[var(--text-dim)] hover:bg-white/[0.04] hover:text-[var(--text)]'
            } ${disabled ? 'pointer-events-none opacity-40' : 'cursor-pointer'}`}
            onClick={() => onChange(p.id)}
            disabled={disabled}
          >
            {isActive && (
              <motion.span
                layoutId={`policy-pill-${id}`}
                className={`absolute inset-0 rounded-full ${
                  isAdaptive
                    ? 'bg-[var(--voip)] shadow-[0_0_14px_rgba(198,255,61,0.3)]'
                    : 'bg-[var(--text)]'
                }`}
                transition={{ type: 'spring', stiffness: 480, damping: 34 }}
              />
            )}
            <span className="relative z-10">{p.label}</span>
          </button>
        );
      })}
    </div>
  );
}
