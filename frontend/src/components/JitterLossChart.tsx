import { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import type { MetricsHistory, TrafficClass } from '../types';
import { CLASS_CONFIG } from '../types';

interface JitterLossChartProps {
  history: MetricsHistory[];
  height?: number;
  className?: string;
}

const classes: TrafficClass[] = ['voip', 'video', 'web', 'bulk'];

export default function JitterLossChart({ history, height: propHeight, className = '' }: JitterLossChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const draw = useCallback(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg) return;

    const width = container.clientWidth;
    const height = propHeight ?? container.clientHeight;
    const margin = { top: 16, right: 40, bottom: 28, left: 36 };
    const innerW = Math.max(10, width - margin.left - margin.right);
    const innerH = Math.max(10, height - margin.top - margin.bottom);

    const sel = d3.select(svg);
    sel.attr('width', width).attr('height', height);
    sel.selectAll('*').remove();

    const g = sel.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    if (history.length === 0) {
      g.append('text')
        .attr('x', innerW / 2).attr('y', innerH / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#8A8880').attr('font-size', 12)
        .attr('font-family', 'Inter Tight')
        .text('Awaiting stream telemetry…');
      return;
    }

    const xExtent = d3.extent(history, d => d.elapsed) as [number, number];
    const x = d3.scaleLinear().domain(xExtent).range([0, innerW]);

    const maxJitter = d3.max(history, d => Math.max(...classes.map(c => d[c].jitter_ms))) ?? 10;
    const yJitter = d3.scaleLinear().domain([0, Math.max(maxJitter * 1.2, 5)]).range([innerH, 0]).nice();

    const maxLoss = d3.max(history, d => Math.max(...classes.map(c => d[c].loss_percent))) ?? 100;
    const yLoss = d3.scaleLinear().domain([0, Math.max(maxLoss * 1.15, 10)]).range([innerH, 0]).nice();

    // Grid
    g.append('g').call(d3.axisLeft(yJitter).ticks(4).tickSize(-innerW).tickFormat(() => ''))
      .selectAll('line').attr('stroke', '#1a1a20').attr('stroke-dasharray', '3,4');
    g.selectAll('.domain').remove();

    // X axis
    g.append('g').attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d => `${d}s`))
      .selectAll('text').attr('fill', '#6E6D66').attr('font-family', 'JetBrains Mono').attr('font-size', 10);

    // Left Y: Jitter
    g.append('g').call(d3.axisLeft(yJitter).ticks(4).tickFormat(d => `${d}ms`))
      .selectAll('text').attr('fill', '#6E6D66').attr('font-family', 'JetBrains Mono').attr('font-size', 10);

    // Right Y: Loss
    g.append('g').attr('transform', `translate(${innerW},0)`)
      .call(d3.axisRight(yLoss).ticks(4).tickFormat(d => `${d}%`))
      .selectAll('text').attr('fill', '#6E6D66').attr('font-family', 'JetBrains Mono').attr('font-size', 10);

    g.selectAll('.tick line').attr('stroke', '#1e1e24');

    // Jitter lines
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
    <div className={`panel h-full ${className}`} data-crosshair-target>
      <div className="panel-head">
        <h3 className="panel-label">Jitter (RFC 3550) &amp; packet loss %</h3>
        <span className="panel-note">Line: jitter · Area: loss</span>
      </div>

      <div ref={containerRef} className="plot">
        <svg ref={svgRef} className="w-full" />
      </div>

      <p className="panel-foot text-[var(--text-faint)]">
        VoIP jitter drops sharply under Strict Priority and Adaptive queuing.
      </p>
    </div>
  );
}
