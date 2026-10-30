import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface LayoutProps {
  children: ReactNode;
}

function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const prefersReduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (prefersReduced) return;
    const onMove = (e: MouseEvent) => {
      if (dotRef.current) {
        dotRef.current.style.left = `${e.clientX - 3}px`;
        dotRef.current.style.top = `${e.clientY - 3}px`;
      }
      if (ringRef.current) {
        ringRef.current.style.left = `${e.clientX - 14}px`;
        ringRef.current.style.top = `${e.clientY - 14}px`;
      }
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [prefersReduced]);

  if (prefersReduced) return null;

  return (
    <>
      <div ref={dotRef} className="cursor-dot hidden md:block" />
      <div ref={ringRef} className="cursor-ring hidden md:block" />
    </>
  );
}

function Preloader() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 900);
    const el = document.getElementById('preloader');
    if (el) {
      setTimeout(() => el.remove(), 1100);
    }
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0A0B0E]"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeInOut' }}
        >
          <motion.span
            className="font-display text-4xl text-[#F3F4F6]"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 0.8, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            Priori
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="film-grain min-h-screen w-full overflow-x-hidden bg-[#0A0B0E] text-[#F3F4F6]">
      <Preloader />
      <CustomCursor />
      <main className="relative z-10 mx-auto w-full max-w-[1440px] min-w-0 px-4 sm:px-6 md:px-8 py-4 sm:py-6">
        {children}
      </main>
    </div>
  );
}
