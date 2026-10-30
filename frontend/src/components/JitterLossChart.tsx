import { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import type { MetricsHistory, TrafficClass } from '../types';
import { CLASS_CONFIG } from '../types';

interface JitterLossChartProps {
  history: MetricsHistory[];
  height?: number;
}

const classes: TrafficClass[] = ['voip', 'video', 'web', 'bulk'];

export default function JitterLossChart({ history, height: propHeight = 220 }: JitterLossChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const draw = useCallback(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg) return;

    const width = container.clientWidth || 400;
    const height = propHeight;
    const margin = { top: 16, right: 42, bottom: 26, left: 42 };
    const innerW = Math.max(10, width - margin.left - margin.right);
    const innerH = Math.max(10, height - margin.top - margin.bottom);

    const sel = d3.select(svg);
    sel
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', '100%')
      .attr('height', height);
    sel.selectAll('*').remove();

    const g = sel.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    if (history.length === 0) {
      g.append('text')
        .attr('x', innerW / 2).attr('y', innerH / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', 'rgba(255,255,255,0.4)').attr('font-size', 12)
        .attr('font-family', 'Inter Tight, sans-serif')
        .text('Awaiting stream telemetry…');
      return;
    }

    const xExtent = d3.extent(history, d => d.elapsed) as [number, number];
    const x = d3.scaleLinear().domain(xExtent).range([0, innerW]);

    const maxJitter = d3.max(history, d => Math.max(...classes.map(c => d[c].jitter_ms))) ?? 10;
    const yJitter = d3.scaleLinear().domain([0, Math.max(maxJitter * 1.2, 5)]).range([innerH, 0]).nice();

    const maxLoss = d3.max(history, d => Math.max(...classes.map(c => d[c].loss_percent))) ?? 100;
    const yLoss = d3.scaleLinear().domain([0, Math.max(maxLoss * 1.15, 10)]).range([innerH, 0]).nice();

    // Grid lines
    g.append('g').call(d3.axisLeft(yJitter).ticks(4).tickSize(-innerW).tickFormat(() => ''))
      .selectAll('line').attr('stroke', 'rgba(255,255,255,0.05)').attr('stroke-dasharray', '3,4');
    g.selectAll('.domain').remove();

    // X axis: 11px muted
    g.append('g').attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d => `${d}s`))
      .selectAll('text').attr('fill', 'rgba(255,255,255,0.45)').attr('font-family', 'JetBrains Mono, monospace').attr('font-size', 11).attr('dy', '10px');

    // Left Y: Jitter
    g.append('g').call(d3.axisLeft(yJitter).ticks(4).tickFormat(d => `${d}ms`))
      .selectAll('text').attr('fill', 'rgba(255,255,255,0.45)').attr('font-family', 'JetBrains Mono, monospace').attr('font-size', 11).attr('dx', '-4px');

    // Right Y: Loss
    g.append('g').attr('transform', `translate(${innerW},0)`)
      .call(d3.axisRight(yLoss).ticks(4).tickFormat(d => `${d}%`))
      .selectAll('text').attr('fill', 'rgba(255,255,255,0.45)').attr('font-family', 'JetBrains Mono, monospace').attr('font-size', 11).attr('dx', '4px');

    g.selectAll('.tick line').attr('stroke', 'rgba(255,255,255,0.08)');

    // Jitter lines: 2px
    for (const cls of classes) {
      const color = CLASS_CONFIG[cls].color;
      const line = d3.line<MetricsHistory>()
        .x(d => x(d.elapsed))
        .y(d => yJitter(d[cls].jitter_ms))
        .curve(d3.curveMonotoneX);

      g.append('path')
        .datum(history)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 2)
        .attr('stroke-linecap', 'round')
        .attr('d', line);
    }

    // Loss areas
    for (const cls of classes) {
      const color = CLASS_CONFIG[cls].color;
      const area = d3.area<MetricsHistory>()
        .x(d => x(d.elapsed))
        .y0(innerH)
        .y1(d => yLoss(d[cls].loss_percent))
        .curve(d3.curveMonotoneX);

      g.append('path')
        .datum(history)
        .attr('fill', color)
        .attr('fill-opacity', 0.08)
        .attr('d', area);
    }
  }, [history, propHeight]);

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  return (
    <div
      className="card-surface p-5 sm:p-6 flex flex-col justify-between h-full min-w-0 w-full"
      data-crosshair-target
    >
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="card-title text-xs font-semibold tracking-wider text-white/55">
            JITTER (RFC 3550) & PACKET LOSS %
          </h3>
          <span className="text-[11px] font-mono text-white/40">Solid: Jitter · Area: Loss</span>
        </div>
        <div ref={containerRef} className="w-full min-w-0 overflow-hidden">
          <svg ref={svgRef} className="w-full h-auto block" />
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-white/[0.06] text-xs font-mono text-white/45">
        VoIP jitter drops sharply under Strict Priority and Adaptive queuing.
      </div>
    </div>
  );
}
