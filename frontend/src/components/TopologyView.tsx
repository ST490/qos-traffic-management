import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { TrafficClass, ClassMetrics } from '../types';
import { CLASS_CONFIG } from '../types';

interface TopologyViewProps {
  metrics: Record<TrafficClass, ClassMetrics>;
  utilization: number;
  policy: string;
  className?: string;
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
  { id: 's1', label: 's1', role: 'edge', x: 195, y: 134 },
  { id: 's2', label: 's2', role: 'core', x: 405, y: 134 },
];

const classOrder: TrafficClass[] = ['voip', 'video', 'web', 'bulk'];

export default function TopologyView({ metrics, utilization, policy, className = '' }: TopologyViewProps) {
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
    <div className={`panel h-full ${className}`} data-crosshair-target>
      <div className="panel-head">
        <h3 className="panel-label">Network topology &amp; flow emulation</h3>
        <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 font-mono text-[0.6875rem] text-[var(--text)]">
          {policy.toUpperCase()} active
        </span>
      </div>

      {/* Capped so the diagram's labels stay legible instead of shrinking with the cell */}
      <div className="mx-auto my-auto w-full max-w-[620px] py-3">
        <svg viewBox="0 0 600 270" className="h-auto w-full" role="img" aria-label="Network topology diagram">
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
            x={212}
            y={switches[0].y - 46}
            width={176}
            height={22}
            rx={11}
            fill="#16161c"
            stroke="#262630"
          />
          <text
            x={300}
            y={switches[0].y - 31}
            textAnchor="middle"
            fill="#C4C2B8"
            fontSize={11}
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
                y={sw.y - 1}
                textAnchor="middle"
                fill="#F2F0EA"
                fontSize={11.5}
                fontWeight={600}
                fontFamily="Inter Tight"
              >
                {sw.label}
              </text>
              <text
                x={sw.x}
                y={sw.y + 12}
                textAnchor="middle"
                fill="#8A8880"
                fontSize={8.5}
                fontFamily="Inter Tight"
              >
                {sw.role}
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
                  fontSize={11.5}
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

      <div className="panel-foot flex-wrap gap-x-4 gap-y-1">
        <span>5001 EF · 5002 AF41 · 5003 AF21 · 5004 BE</span>
        <span className="text-[var(--text-faint)]">Senders h1–h4 → receivers h5–h8</span>
      </div>
    </div>
  );
}
