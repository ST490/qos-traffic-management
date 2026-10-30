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
      className={`inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#14161F] p-1 shadow-inner backdrop-blur-md ${className}`}
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
            className={`relative rounded-lg px-4 py-2 text-xs md:text-sm font-semibold font-ui transition-colors duration-150 cursor-pointer select-none whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C6FF3D] ${
              isActive
                ? isAdaptive
                  ? 'text-[#0A0B0E]'
                  : 'text-[#0A0B0E]'
                : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
            } ${disabled ? 'pointer-events-none opacity-40' : ''}`}
            onClick={() => onChange(p.id)}
            disabled={disabled}
          >
            {isActive && (
              <motion.span
                layoutId="segmented-control-active"
                className={`absolute inset-0 rounded-lg ${
                  isAdaptive
                    ? 'bg-[#C6FF3D] shadow-[0_0_14px_rgba(198,255,61,0.35)]'
                    : 'bg-[#F3F4F6] shadow-sm'
                }`}
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <span className="relative z-10">{p.label}</span>
          </button>
        );
      })}
    </div>
  );
}
