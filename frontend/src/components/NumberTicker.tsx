import { useEffect, useRef } from 'react';
import { motion, useSpring, useMotionValue } from 'framer-motion';

interface NumberTickerProps {
  value: number;
  decimals?: number;
  suffix?: string;
  className?: string;
  fontSize?: string;
}

export default function NumberTicker({
  value,
  decimals = 2,
  suffix = '',
  className = '',
  fontSize = 'text-4xl',
}: NumberTickerProps) {
  const motionVal = useMotionValue(0);
  const spring = useSpring(motionVal, { stiffness: 80, damping: 20 });
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    motionVal.set(value);
  }, [value, motionVal]);

  useEffect(() => {
    const unsubscribe = spring.on('change', (v) => {
      if (ref.current) {
        ref.current.textContent = v.toFixed(decimals);
      }
    });
    return unsubscribe;
  }, [spring, decimals]);

  return (
    <span className={`font-mono ${fontSize} font-semibold tracking-tight ${className}`}>
      <motion.span ref={ref}>{value.toFixed(decimals)}</motion.span>
      {suffix && (
        <span className="text-[var(--text-dim)] text-sm ml-1 font-ui font-normal">
          {suffix}
        </span>
      )}
    </span>
  );
}
