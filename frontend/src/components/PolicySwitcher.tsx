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
  disabled?: boolean;
}

export default function PolicySwitcher({ active, onChange, disabled }: PolicySwitcherProps) {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] p-1"
      role="tablist"
      aria-label="QoS Policy"
    >
      {policies.map((p) => (
        <button
          key={p.id}
          role="tab"
          aria-selected={active === p.id}
          className={`relative rounded-full px-4 py-1.5 text-sm font-medium font-ui transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--voip)] ${
            active === p.id
              ? 'text-[var(--ground)]'
              : 'text-[var(--text-dim)] hover:text-[var(--text)]'
          } ${disabled ? 'pointer-events-none opacity-50' : ''}`}
          onClick={() => onChange(p.id)}
          disabled={disabled}
        >
          {active === p.id && (
            <motion.span
              layoutId="policy-pill"
              className="absolute inset-0 rounded-full bg-[var(--text)]"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          <span className="relative z-10">{p.label}</span>
        </button>
      ))}
    </div>
  );
}
