import { useEffect, useRef, type ReactNode } from 'react';
import Crosshair from './Crosshair';

interface LayoutProps {
  children: ReactNode;
  /** Content of the sticky top bar. Rendered inside the page container. */
  header?: ReactNode;
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

/** Retires the static preloader painted by index.html before React boots. */
function useRetireBootPreloader() {
  useEffect(() => {
    const el = document.getElementById('preloader');
    if (!el) return;
    const hide = setTimeout(() => {
      el.style.opacity = '0';
    }, 260);
    const remove = setTimeout(() => el.remove(), 700);
    return () => {
      clearTimeout(hide);
      clearTimeout(remove);
    };
  }, []);
}

export default function Layout({ children, header }: LayoutProps) {
  useRetireBootPreloader();

  return (
    <div className="film-grain flex min-h-screen flex-col">
      <CustomCursor />

      {/* HUD overlay for the whole site: fixed to the viewport, so the crosshair
          tracks the pointer over every band, not just the masthead. Every major
          surface carries data-crosshair-target, so the box follows the component
          you are over; buttons and links inside it take precedence. Coordinates
          are off because their edge chips would sit on the sticky header. */}
      <Crosshair
        color="#ffffff"
        targetEffect="lock"
        targetSelector="a, button, [data-crosshair-target]"
        thickness={1}
        opacity={0.55}
        fade={0.85}
        smoothing={0.35}
        showCoordinates={false}
      />

      {/* Full-bleed chrome: the rule and the blur span the viewport,
          the content inside it lines up with the page container. */}
      <header className="z-nav sticky top-0 border-b border-[var(--border-soft)] bg-[#0b0b0c]/88 backdrop-blur-xl">
        <div className="shell flex h-14 items-center justify-between gap-4 md:grid md:grid-cols-[1fr_auto_1fr]">
          {header}
        </div>
      </header>

      <main className="shell flex-1 pt-6">{children}</main>

      <footer className="mt-[var(--band-loose)] border-t border-[var(--border-soft)]">
        <div className="shell flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 py-6 font-mono text-[0.6875rem] text-[var(--text-dim)]">
          <span>Priori — QoS Traffic Management System</span>
          <span className="text-[var(--text-faint)]">
            OpenFlow 1.3 · Pure-Python Simulation Mode
          </span>
        </div>
      </footer>
    </div>
  );
}
