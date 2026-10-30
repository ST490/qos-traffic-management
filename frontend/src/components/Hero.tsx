import { useRef } from 'react';
import { motion } from 'framer-motion';
import Crosshair from './Crosshair';

export default function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-gradient-to-b from-[#131317]/70 via-[#101013]/80 to-[var(--ground)] p-[var(--panel-pad)] sm:p-6 md:p-7"
      aria-label="Overview"
    >
      {/* ReactBits Crosshair HUD effect */}
      <Crosshair
        containerRef={containerRef}
        color="#ffffff"
        targetEffect="lock"
        thickness={1}
        opacity={0.85}
        smoothing={0.35}
        showCoordinates
      />

      {/* Top row: what this is, and where the API docs live */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-2)]/70 px-3 py-1 font-mono text-[0.625rem] uppercase tracking-[0.1em] whitespace-nowrap text-[var(--text-dim)] sm:text-[0.6875rem] sm:tracking-[0.12em]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--voip)] motion-safe:animate-pulse" />
          <span>QoS Policy Engine · 10 Mbps Bottleneck</span>
        </div>

        <a
          href="http://localhost:8000/docs"
          target="_blank"
          rel="noreferrer"
          data-crosshair-target
          className="inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] px-3.5 py-1.5 font-mono text-xs text-[var(--text)] transition-colors duration-200 hover:border-[var(--voip)] hover:text-[var(--voip)]"
        >
          <span>Read the docs</span>
          <span aria-hidden="true">↗</span>
        </a>
      </div>

      {/* Title sits beside its own summary, so the first screen keeps room for data */}
      <div className="relative z-10 mt-6 grid gap-x-10 gap-y-4 lg:grid-cols-12 lg:items-center">
        <motion.h1
          className="font-display text-[clamp(1.9rem,3.6vw,3.1rem)] leading-[1.04] tracking-[-0.02em] text-[var(--text)] lg:col-span-7"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          Every packet is not equal.
        </motion.h1>

        <motion.p
          className="max-w-[52ch] text-sm leading-relaxed text-[#9b9990] lg:col-span-5 lg:pb-1.5"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08, ease: 'easeOut' }}
        >
          Autonomous priority scheduling across VoIP, Video, Web and Bulk streams. Watch
          real-time flow meters eliminate bufferbloat and restore wire latency.
        </motion.p>
      </div>
    </div>
  );
}

