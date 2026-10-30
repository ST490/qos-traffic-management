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
  { id: 'h1', label: 'h1', x: 40, y: 44, ip: '10.0.0.1' },
  { id: 'h2', label: 'h2', x: 40, y: 104, ip: '10.0.0.2' },
  { id: 'h3', label: 'h3', x: 40, y: 164, ip: '10.0.0.3' },
  { id: 'h4', label: 'h4', x: 40, y: 224, ip: '10.0.0.4' },
  { id: 'h5', label: 'h5', x: 560, y: 44, ip: '10.0.0.5' },
  { id: 'h6', label: 'h6', x: 560, y: 104, ip: '10.0.0.6' },
  { id: 'h7', label: 'h7', x: 560, y: 164, ip: '10.0.0.7' },
  { id: 'h8', label: 'h8', x: 560, y: 224, ip: '10.0.0.8' },
];

const switches = [
  { id: 's1', label: 's1 (Edge)', x: 195, y: 134 },
  { id: 's2', label: 's2 (Core)', x: 405, y: 134 },
];

const classOrder: TrafficClass[] = ['voip', 'video', 'web', 'bulk'];

export default function TopologyView({ metrics, utilization, policy }: TopologyViewProps) {
  const bottleneckColor =
    utilization < 0.7 ? '#C6FF3D' : utilization < 0.85 ? '#FFD700' : '#FF4444';

  const particles = useMemo(() => {
    return classOrder.map((cls, i) => {
      const throughput = metrics[cls]?.throughput_mbps ?? 0;
      const speed = Math.max(1.8, 6 - throughput * 0.4);
      return { cls, color: CLASS_CONFIG[cls].color, speed, yOffset: i * 8 - 12, throughput };
    });
  }, [metrics]);

  return (
    <div
      className="rounded-2xl border border-[#1f1f24] hover:border-[#2a2a32] bg-[#111114] p-7 md:p-8 flex flex-col justify-between shadow-[0_4px_24px_rgba(0,0,0,0.4)] transition-all duration-300"
      data-crosshair-target
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="label-sm text-[#8A8880] tracking-widest font-semibold text-xs">
          NETWORK TOPOLOGY & FLOW EMULATION
        </h3>
        <span className="font-mono text-xs px-2.5 py-1 rounded-full border border-[#26262e] bg-[#17171e] text-[#F2F0EA]">
          {policy.toUpperCase()} ACTIVE
        </span>
      </div>

      <div className="w-full overflow-hidden my-auto py-2">
        <svg viewBox="0 0 600 270" className="w-full h-auto max-h-[280px]" role="img" aria-label="Network topology diagram">
          {/* Host-to-switch links left */}
          {hosts.slice(0, 4).map((h, i) => (
            <line
              key={`l-${h.id}`}
              x1={h.x + 18}
              y1={h.y}
              x2={switches[0].x - 22}
              y2={switches[0].y}
              stroke={CLASS_CONFIG[classOrder[i]].color}
              strokeWidth={1.5}
              strokeOpacity={0.35}
            />
          ))}

          {/* Core switch to destination hosts right */}
          {hosts.slice(4).map((h, i) => (
            <line
              key={`r-${h.id}`}
              x1={switches[1].x + 22}
              y1={switches[1].y}
              x2={h.x - 18}
              y2={h.y}
              stroke={CLASS_CONFIG[classOrder[i]].color}
              strokeWidth={1.5}
              strokeOpacity={0.35}
            />
          ))}

          {/* Bottleneck Link */}
          <line
            x1={switches[0].x + 24}
            y1={switches[0].y}
            x2={switches[1].x - 24}
            y2={switches[1].y}
            stroke={bottleneckColor}
            strokeWidth={4}
            strokeOpacity={0.8}
            strokeLinecap="round"
          />

          {/* Bottleneck Badge */}
          <rect
            x={225}
            y={switches[0].y - 32}
            width={150}
            height={20}
            rx={10}
            fill="#16161c"
            stroke="#262630"
          />
          <text
            x={300}
            y={switches[0].y - 18}
            textAnchor="middle"
            fill="#C4C2B8"
            fontSize={9.5}
            fontFamily="JetBrains Mono"
          >
            10 Mbps · 20ms · {(utilization * 100).toFixed(0)}% load
          </text>

          {/* Animated Particles flowing on Bottleneck */}
          {particles.map((p) =>
            p.throughput > 0.01 ? (
              <motion.circle
                key={p.cls}
                r={3.2}
                fill={p.color}
                opacity={0.9}
                initial={{ cx: switches[0].x + 26, cy: switches[0].y + p.yOffset }}
                animate={{
                  cx: [switches[0].x + 26, switches[1].x - 26],
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

          {/* Switch Nodes */}
          {switches.map((sw) => (
            <g key={sw.id}>
              <rect
                x={sw.x - 24}
                y={sw.y - 20}
                width={48}
                height={40}
                rx={8}
                fill="#16161d"
                stroke="#2a2a34"
                strokeWidth={1.5}
              />
              <text
                x={sw.x}
                y={sw.y + 4}
                textAnchor="middle"
                fill="#F2F0EA"
                fontSize={10}
                fontWeight={600}
                fontFamily="Inter Tight"
              >
                {sw.label}
              </text>
            </g>
          ))}

          {/* Host Nodes */}
          {hosts.map((h, i) => {
            const cls = classOrder[i % 4];
            const cfg = CLASS_CONFIG[cls];
            return (
              <g key={h.id}>
                <circle
                  cx={h.x}
                  cy={h.y}
                  r={16}
                  fill="#15151b"
                  stroke={cfg.color}
                  strokeWidth={1.5}
                />
                <text
                  x={h.x}
                  y={h.y + 4}
                  textAnchor="middle"
                  fill="#F2F0EA"
                  fontSize={10}
                  fontWeight={500}
                  fontFamily="JetBrains Mono"
                >
                  {h.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex items-center justify-between text-xs font-mono text-[#8A8880] pt-3 border-t border-[#1a1a20]">
        <span>Senders: h1–h4 (DSCP marked)</span>
        <span>Receivers: h5–h8</span>
      </div>
    </div>
  );
}
