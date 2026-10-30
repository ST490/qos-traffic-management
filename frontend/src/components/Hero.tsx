import { useRef } from 'react';
import { motion } from 'framer-motion';
import Crosshair from './Crosshair';

const headingWords = ['Every', 'packet', 'is', 'not', 'equal.'];

const container = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12, delayChildren: 0.2 },
  },
};

const wordVariant = {
  hidden: { y: 50, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.6, ease: 'easeOut' as const },
  },
};

export default function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', minHeight: 420 }}
      className="relative rounded-3xl border border-[#1e1e24] bg-gradient-to-b from-[#131317]/80 via-[#101013]/90 to-[#0B0B0C] p-8 sm:p-12 md:p-16 overflow-hidden flex flex-col justify-between mb-12 shadow-[0_12px_40px_rgba(0,0,0,0.6)]"
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

      {/* Background technical grid accent */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.035] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:32px_32px]"
        aria-hidden="true"
      />

      {/* Top HUD badge row */}
      <div className="relative z-10 flex items-center justify-between mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#24242c] bg-[#141419]/70 text-[0.6875rem] font-mono tracking-widest uppercase text-[#8A8880]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#C6FF3D] animate-pulse" />
          <span>QoS Policy Engine · 10 Mbps Bottleneck</span>
        </div>

        <a
          href="http://localhost:8000/docs"
          target="_blank"
          rel="noreferrer"
          data-crosshair-target
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#2e2e38] hover:border-[#C6FF3D] bg-[#16161d] hover:bg-[#1a1a24] text-xs font-mono text-[#F2F0EA] hover:text-[#C6FF3D] transition-all duration-200"
        >
          <span>Read the docs</span>
          <span className="text-xs">↗</span>
        </a>
      </div>

      {/* Main Title */}
      <div className="relative z-10 max-w-4xl my-auto">
        <motion.h1
          className="font-display text-[clamp(2.75rem,8.5vw,6.75rem)] leading-[0.92] tracking-tight text-[#F2F0EA]"
          variants={container}
          initial="hidden"
          animate="visible"
        >
          {headingWords.map((word, i) => (
            <span key={i} className="inline-block overflow-hidden mr-[0.22em]">
              <motion.span className="inline-block" variants={wordVariant}>
                {word}
              </motion.span>
            </span>
          ))}
        </motion.h1>

        <motion.p
          className="mt-6 max-w-2xl text-base md:text-lg text-[#9B9990] font-ui leading-relaxed"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.5 }}
        >
          Autonomous priority scheduling across VoIP, Video, Web, and Bulk streams.
          Watch real-time flow meters eliminate bufferbloat and restore wire latency.
        </motion.p>
      </div>

      {/* Bottom telemetry quick stats */}
      <div className="relative z-10 mt-10 pt-6 border-t border-[#1e1e24] flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-[#8A8880]">
        <div className="flex items-center gap-6">
          <span>PORT 5001: EF (VoIP)</span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">PORT 5002: AF41 (Video)</span>
          <span className="hidden md:inline">·</span>
          <span className="hidden md:inline">PORT 5004: BE (Bulk)</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[#F2F0EA]">Interactive HUD:</span>
          <span>Hover targets to lock coordinates</span>
        </div>
      </div>
    </div>
  );
}
