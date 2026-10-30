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
  className?: string;
}

export default function PolicySwitcher({ active, onChange, disabled, className = '' }: PolicySwitcherProps) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border border-[#232328] bg-[#111114]/90 p-1 backdrop-blur-md shadow-inner ${className}`}
      role="tablist"
      aria-label="QoS Policy Switcher"
    >
      {policies.map((p) => {
        const isActive = active === p.id;
        const isAdaptive = p.id === 'adaptive';

        return (
          <button
            key={p.id}
            role="tab"
            aria-selected={isActive}
            data-crosshair-target
            className={`relative rounded-full px-5 py-2 text-xs md:text-sm font-medium font-ui transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--voip)] cursor-pointer select-none ${
              isActive
                ? isAdaptive
                  ? 'text-[#0B0B0C] font-semibold'
                  : 'text-[#0B0B0C] font-semibold'
                : 'text-[#8A8880] hover:text-[#F2F0EA] hover:bg-white/[0.04]'
            } ${disabled ? 'pointer-events-none opacity-40' : ''}`}
            onClick={() => onChange(p.id)}
            disabled={disabled}
          >
            {isActive && (
              <motion.span
                layoutId="policy-pill-indicator"
                className={`absolute inset-0 rounded-full ${
                  isAdaptive ? 'bg-[#C6FF3D] shadow-[0_0_18px_rgba(198,255,61,0.35)]' : 'bg-[#F2F0EA]'
                }`}
                transition={{ type: 'spring', stiffness: 450, damping: 32 }}
              />
            )}
            <span className="relative z-10">{p.label}</span>
          </button>
        );
      })}
    </div>
  );
}
