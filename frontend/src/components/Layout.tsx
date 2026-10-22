import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface LayoutProps {
  children: ReactNode;
}

function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (prefersReduced) return;
    const onMove = (e: MouseEvent) => {
      if (dotRef.current) {
        dotRef.current.style.left = `${e.clientX - 4}px`;
        dotRef.current.style.top = `${e.clientY - 4}px`;
      }
      if (ringRef.current) {
        ringRef.current.style.left = `${e.clientX - 16}px`;
        ringRef.current.style.top = `${e.clientY - 16}px`;
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
    const timer = setTimeout(() => setVisible(false), 1200);
    // Remove the HTML preloader
    const el = document.getElementById('preloader');
    if (el) {
      setTimeout(() => el.remove(), 1400);
    }
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--ground)]"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
        >
          <motion.span
            className="font-display text-4xl text-[var(--text)]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 0.6, y: 0 }}
            transition={{ duration: 0.4 }}
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
    <div className="film-grain min-h-screen">
      <Preloader />
      <CustomCursor />
      <main className="relative z-10 mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
