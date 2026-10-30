import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { TrafficClass, ClassMetrics } from '../types';
import { CLASS_CONFIG } from '../types';

interface TopologyViewProps {
  metrics: Record<TrafficClass, ClassMetrics>;
  utilization: number;
  policy: string;
}

const hosts = [
  { id: 'h1', label: 'h1', x: 50, y: 45 },
  { id: 'h2', label: 'h2', x: 50, y: 115 },
  { id: 'h3', label: 'h3', x: 50, y: 185 },
  { id: 'h4', label: 'h4', x: 50, y: 255 },
  { id: 'h5', label: 'h5', x: 630, y: 45 },
  { id: 'h6', label: 'h6', x: 630, y: 115 },
  { id: 'h7', label: 'h7', x: 630, y: 185 },
  { id: 'h8', label: 'h8', x: 630, y: 255 },
];

const switches = [
  { id: 's1', label: 's1 (Edge)', x: 230, y: 150 },
  { id: 's2', label: 's2 (Core)', x: 450, y: 150 },
];

const classOrder: TrafficClass[] = ['voip', 'video', 'web', 'bulk'];

export default function TopologyView({ metrics, utilization, policy }: TopologyViewProps) {
  const bottleneckColor =
    utilization < 0.7 ? '#C6FF3D' : utilization < 0.85 ? '#F59E0B' : '#EF4444';

  const particles = useMemo(() => {
    return classOrder.map((cls, i) => {
      const throughput = metrics[cls]?.throughput_mbps ?? 0;
      const speed = Math.max(1.8, 5.5 - throughput * 0.4);
      return { cls, color: CLASS_CONFIG[cls].color, speed, yOffset: i * 8 - 12, throughput };
    });
  }, [metrics]);

  return (
    <div
      className="card-surface p-5 sm:p-6 flex flex-col justify-between h-full min-w-0 w-full"
      data-crosshair-target
    >
      <div>
        {/* Title row */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="card-title text-xs font-semibold tracking-wider text-white/55">
            NETWORK TOPOLOGY & FLOW EMULATION
          </h3>
          <span className="font-mono text-xs px-2.5 py-1 rounded-md border border-white/10 bg-white/[0.04] text-white/80">
            {policy.toUpperCase()} ACTIVE
          </span>
        </div>

        {/* SVG Container with internal padding and min height */}
        <div className="w-full min-w-0 overflow-hidden py-3">
          <svg
            viewBox="0 0 680 300"
            className="w-full h-auto max-h-[300px] block"
            role="img"
            aria-label="Network topology diagram"
          >
            {/* Host-to-switch links left: clean thin links at low opacity */}
            {hosts.slice(0, 4).map((h, i) => (
              <line
                key={`l-${h.id}`}
                x1={h.x + 24}
                y1={h.y}
                x2={switches[0].x - 30}
                y2={switches[0].y}
                stroke={CLASS_CONFIG[classOrder[i]].color}
                strokeWidth={1.2}
                strokeOpacity={0.25}
              />
            ))}

            {/* Core switch to destination hosts right */}
            {hosts.slice(4).map((h, i) => (
              <line
                key={`r-${h.id}`}
                x1={switches[1].x + 30}
                y1={switches[1].y}
                x2={h.x - 24}
                y2={h.y}
                stroke={CLASS_CONFIG[classOrder[i]].color}
                strokeWidth={1.2}
                strokeOpacity={0.25}
              />
            ))}

            {/* Bottleneck Link */}
            <line
              x1={switches[0].x + 30}
              y1={switches[0].y}
              x2={switches[1].x - 30}
              y2={switches[1].y}
              stroke={bottleneckColor}
              strokeWidth={4}
              strokeOpacity={0.8}
              strokeLinecap="round"
            />

            {/* Link label in a small pill placed cleanly ABOVE the link with NO overlap */}
            <g transform={`translate(${340 - 85}, ${switches[0].y - 38})`}>
              <rect
                width={170}
                height={22}
                rx={11}
                fill="#161822"
                stroke="rgba(255,255,255,0.12)"
                strokeWidth={1}
              />
              <text
                x={85}
                y={15}
                textAnchor="middle"
                fill="#E2E4E9"
                fontSize={10.5}
                fontFamily="JetBrains Mono, monospace"
                fontWeight={500}
              >
                10 Mbps · 20ms · {(utilization * 100).toFixed(0)}% load
              </text>
            </g>

            {/* Animated Particles flowing on Bottleneck */}
            {particles.map((p) =>
              p.throughput > 0.01 ? (
                <motion.circle
                  key={p.cls}
                  r={3.5}
                  fill={p.color}
                  opacity={0.9}
                  initial={{ cx: switches[0].x + 32, cy: switches[0].y + p.yOffset }}
                  animate={{
                    cx: [switches[0].x + 32, switches[1].x - 32],
                    cy: [switches[0].y + p.yOffset, switches[1].y + p.yOffset],
                  }}
                  transition={{
                    duration: p.speed,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                />
              ) : null
            )}

            {/* Switches: larger hit area with soft rings */}
            {switches.map((sw) => (
              <g key={sw.id}>
                <rect
                  x={sw.x - 30}
                  y={sw.y - 24}
                  width={60}
                  height={48}
                  rx={10}
                  fill="#171A24"
                  stroke="rgba(255,255,255,0.18)"
                  strokeWidth={1.5}
                />
                <text
                  x={sw.x}
                  y={sw.y + 5}
                  textAnchor="middle"
                  fill="#F3F4F6"
                  fontSize={11}
                  fontWeight={600}
                  fontFamily="Inter Tight, sans-serif"
                >
                  {sw.label}
                </text>
              </g>
            ))}

            {/* Node circles: 44-48px with soft colored rings */}
            {hosts.map((h, i) => {
              const cls = classOrder[i % 4];
              const cfg = CLASS_CONFIG[cls];
              return (
                <g key={h.id}>
                  {/* Outer soft ring */}
                  <circle
                    cx={h.x}
                    cy={h.y}
                    r={22}
                    fill="#13151D"
                    stroke={cfg.color}
                    strokeWidth={1.5}
                    strokeOpacity={0.8}
                  />
                  {/* Inner glow fill */}
                  <circle
                    cx={h.x}
                    cy={h.y}
                    r={18}
                    fill={cfg.color}
                    fillOpacity={0.08}
                  />
                  <text
                    x={h.x}
                    y={h.y + 4}
                    textAnchor="middle"
                    fill="#F3F4F6"
                    fontSize={11}
                    fontWeight={600}
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {h.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Pinned footer with 16px top padding and subtle top divider */}
      <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center justify-between text-xs font-mono text-white/45">
        <span>Senders: h1–h4 (DSCP tagged)</span>
        <span>Receivers: h5–h8</span>
      </div>
    </div>
  );
}
