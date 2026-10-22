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
  { id: 'h1', label: 'h1', x: 40, y: 40 },
  { id: 'h2', label: 'h2', x: 40, y: 100 },
  { id: 'h3', label: 'h3', x: 40, y: 160 },
  { id: 'h4', label: 'h4', x: 40, y: 220 },
  { id: 'h5', label: 'h5', x: 560, y: 40 },
  { id: 'h6', label: 'h6', x: 560, y: 100 },
  { id: 'h7', label: 'h7', x: 560, y: 160 },
  { id: 'h8', label: 'h8', x: 560, y: 220 },
];

const switches = [
  { id: 's1', label: 'S1', x: 200, y: 130 },
  { id: 's2', label: 'S2', x: 400, y: 130 },
];

const classOrder: TrafficClass[] = ['voip', 'video', 'web', 'bulk'];

export default function TopologyView({ metrics, utilization, policy }: TopologyViewProps) {
  const bottleneckColor =
    utilization < 0.7 ? 'var(--voip)' : utilization < 0.85 ? '#FFD700' : '#FF4444';

  // Animated particles along the bottleneck
  const particles = useMemo(() => {
    return classOrder.map((cls, i) => {
      const throughput = metrics[cls]?.throughput_mbps ?? 0;
      const speed = Math.max(2, 8 - throughput); // faster for higher throughput
      return { cls, color: CLASS_CONFIG[cls].color, speed, yOffset: i * 8 - 12, throughput };
    });
  }, [metrics]);

  return (
    <div className="glass-card p-5 overflow-hidden">
      <h3 className="label-sm mb-4">Network Topology · {policy.toUpperCase()}</h3>
      <svg viewBox="0 0 600 260" className="w-full" role="img" aria-label="Network topology diagram">
        {/* Host-to-switch links */}
        {hosts.slice(0, 4).map((h, i) => (
          <line key={`l-${h.id}`} x1={h.x + 14} y1={h.y} x2={switches[0].x - 16} y2={switches[0].y}
            stroke={CLASS_CONFIG[classOrder[i]].color} strokeWidth={1} strokeOpacity={0.3} />
        ))}
        {hosts.slice(4).map((h, i) => (
          <line key={`r-${h.id}`} x1={switches[1].x + 16} y1={switches[1].y} x2={h.x - 14} y2={h.y}
            stroke={CLASS_CONFIG[classOrder[i]].color} strokeWidth={1} strokeOpacity={0.3} />
        ))}

        {/* Bottleneck link */}
        <line
          x1={switches[0].x + 20} y1={switches[0].y}
          x2={switches[1].x - 20} y2={switches[1].y}
          stroke={bottleneckColor} strokeWidth={3} strokeOpacity={0.6}
        />
        <text x={300} y={switches[0].y - 20} textAnchor="middle"
          fill="#8A8880" fontSize={9} fontFamily="Inter Tight">
          10 Mbps · 20ms · {(utilization * 100).toFixed(0)}%
        </text>

        {/* Animated particles on bottleneck */}
        {particles.map((p) => (
          p.throughput > 0.01 && (
            <motion.circle
              key={p.cls}
              r={3}
              fill={p.color}
              opacity={0.8}
              initial={{ cx: switches[0].x + 24, cy: switches[0].y + p.yOffset }}
              animate={{
                cx: [switches[0].x + 24, switches[1].x - 24],
                cy: [switches[0].y + p.yOffset, switches[1].y + p.yOffset],
              }}
              transition={{
                duration: p.speed,
                repeat: Infinity,
                ease: 'linear',
              }}
            />
          )
        ))}

        {/* Switches */}
        {switches.map((sw) => (
          <g key={sw.id}>
            <rect x={sw.x - 16} y={sw.y - 16} width={32} height={32} rx={6}
              fill="var(--surface)" stroke="var(--border)" strokeWidth={1} />
            <text x={sw.x} y={sw.y + 4} textAnchor="middle"
              fill="var(--text)" fontSize={11} fontWeight={600} fontFamily="Inter Tight">
              {sw.label}
            </text>
          </g>
        ))}

        {/* Hosts */}
        {hosts.map((h, i) => {
          const cls = classOrder[i % 4];
          return (
            <g key={h.id}>
              <circle cx={h.x} cy={h.y} r={14} fill="var(--surface)" stroke={CLASS_CONFIG[cls].color} strokeWidth={1} />
              <text x={h.x} y={h.y + 4} textAnchor="middle"
                fill="var(--text)" fontSize={9} fontFamily="Inter Tight">
                {h.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
