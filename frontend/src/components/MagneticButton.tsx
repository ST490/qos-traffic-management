import { useRef, useState, useCallback, type ReactNode } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

interface MagneticButtonProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  'aria-label'?: string;
}

export default function MagneticButton({
  children,
  onClick,
  className = '',
  variant = 'primary',
  disabled = false,
  'aria-label': ariaLabel,
}: MagneticButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 300, damping: 20 });
  const springY = useSpring(y, { stiffness: 300, damping: 20 });

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!ref.current || disabled) return;
      const rect = ref.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      x.set((e.clientX - cx) * 0.3);
      y.set((e.clientY - cy) * 0.3);
    },
    [x, y, disabled]
  );

  const handleMouseLeave = useCallback(() => {
    x.set(0);
    y.set(0);
    setHovered(false);
  }, [x, y]);

  const base =
    'relative inline-flex items-center justify-center gap-2 rounded-full font-ui text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--voip)]';

  const variants: Record<string, string> = {
    primary:
      'bg-[var(--text)] text-[var(--ground)] hover:bg-[var(--voip)] px-6 py-2.5',
    secondary:
      'border border-[var(--border)] text-[var(--text)] hover:border-[var(--text-dim)] px-6 py-2.5',
    ghost:
      'text-[var(--text-dim)] hover:text-[var(--text)] px-4 py-2',
  };

  return (
    <motion.button
      ref={ref}
      style={{ x: springX, y: springY }}
      className={`${base} ${variants[variant]} ${className} ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      whileTap={{ scale: 0.97 }}
    >
      {children}
      {hovered && (
        <motion.span
          className="absolute inset-0 rounded-full bg-white/5"
          layoutId="magnetic-glow"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        />
      )}
    </motion.button>
  );
}
