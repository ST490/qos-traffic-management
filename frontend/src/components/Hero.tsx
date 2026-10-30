import { useRef } from 'react';
import { motion } from 'framer-motion';
import Crosshair from './Crosshair';

const headingWords = ['Every', 'packet', 'is', 'not', 'equal.'];

const container = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1, delayChildren: 0.15 },
  },
};

const wordVariant = {
  hidden: { y: 40, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.5, ease: 'easeOut' as const },
  },
};

export default function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', minHeight: 380 }}
      className="card-surface relative w-full min-w-0 p-6 sm:p-8 md:p-12 overflow-hidden flex flex-col justify-between"
      aria-label="Hero"
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

      {/* Subtle background technical grid accent */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.025] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:32px_32px]"
        aria-hidden="true"
      />

      {/* Top HUD badge row */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-white/[0.06]">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/[0.03] text-xs font-mono tracking-wider uppercase text-white/60">
          <span className="w-2 h-2 rounded-full bg-[#C6FF3D] animate-pulse" />
          <span>QoS Policy Engine · 10 Mbps Bottleneck</span>
        </div>

        <a
          href="http://localhost:8000/docs"
          target="_blank"
          rel="noreferrer"
          data-crosshair-target
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-white/15 hover:border-[#C6FF3D] bg-white/[0.04] hover:bg-white/[0.08] text-xs font-mono text-white/80 hover:text-[#C6FF3D] transition-all duration-150"
        >
          <span>Read the docs</span>
          <span className="text-xs">↗</span>
        </a>
      </div>

      {/* Main Title & Subtitle */}
      <div className="relative z-10 max-w-4xl my-auto py-2">
        <motion.h1
          className="font-display text-[clamp(2.5rem,7vw,5.5rem)] leading-[0.96] tracking-tight text-[#F3F4F6]"
          variants={container}
          initial="hidden"
          animate="visible"
        >
          {headingWords.map((word, i) => (
            <span key={i} className="inline-block overflow-hidden mr-[0.2em]">
              <motion.span className="inline-block" variants={wordVariant}>
                {word}
              </motion.span>
            </span>
          ))}
        </motion.h1>

        <motion.p
          className="mt-5 max-w-2xl text-sm sm:text-base md:text-lg text-white/60 font-ui leading-relaxed"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.4 }}
        >
          Autonomous priority scheduling across VoIP, Video, Web, and Bulk streams.
          Watch real-time flow meters eliminate bufferbloat and restore wire latency.
        </motion.p>
      </div>

      {/* Bottom telemetry quick stats */}
      <div className="relative z-10 mt-6 pt-4 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-y-2 gap-x-4 text-xs font-mono text-white/50">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>PORT 5001: EF (VoIP)</span>
          <span className="text-white/20">·</span>
          <span>PORT 5002: AF41 (Video)</span>
          <span className="text-white/20">·</span>
          <span>PORT 5003: AF21 (Web)</span>
          <span className="text-white/20">·</span>
          <span>PORT 5004: BE (Bulk)</span>
        </div>

        <div className="flex items-center gap-2 text-white/40">
          <span className="text-white/70 font-medium">Interactive HUD:</span>
          <span>Hover targets to lock coordinates</span>
        </div>
      </div>
    </div>
  );
}
