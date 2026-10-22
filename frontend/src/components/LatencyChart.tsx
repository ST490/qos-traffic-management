import { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import type { MetricsHistory, TrafficClass } from '../types';
import { CLASS_CONFIG } from '../types';

interface LatencyChartProps {
  history: MetricsHistory[];
  height?: number;
}

const classes: TrafficClass[] = ['voip', 'video', 'web', 'bulk'];

export default function LatencyChart({ history, height: propHeight = 220 }: LatencyChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const draw = useCallback(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg) return;

    const width = container.clientWidth;
    const height = propHeight;
    const margin = { top: 16, right: 16, bottom: 32, left: 48 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const sel = d3.select(svg);
    sel.attr('width', width).attr('height', height);
    sel.selectAll('*').remove();

    const g = sel.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    if (history.length === 0) {
      g.append('text')
        .attr('x', innerW / 2).attr('y', innerH / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#8A8880').attr('font-size', 13)
        .attr('font-family', 'Inter Tight')
        .text('Waiting for data…');
      return;
    }

    const xExtent = d3.extent(history, d => d.elapsed) as [number, number];
    const x = d3.scaleLinear().domain(xExtent).range([0, innerW]);

    const maxLatency = d3.max(history, d =>
      Math.max(...classes.map(c => d[c].latency_p99_ms))
    ) ?? 100;
    const y = d3.scaleLinear().domain([0, maxLatency * 1.15]).range([innerH, 0]).nice();

    // Grid
    g.append('g').call(d3.axisLeft(y).tickSize(-innerW).tickFormat(() => ''))
      .selectAll('line').attr('stroke', '#1a1a1a').attr('stroke-dasharray', '2,3');
    g.selectAll('.domain').remove();

    // Axes
    g.append('g').attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat(d => `${d}s`))
      .selectAll('text').attr('fill', '#8A8880').attr('font-size', 10);

    g.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(d => `${d}`))
      .selectAll('text').attr('fill', '#8A8880').attr('font-family', 'JetBrains Mono').attr('font-size', 10);

    g.selectAll('.tick line').attr('stroke', '#2A2A2D');

    // Area for p95-p99 range, then line for avg
    for (const cls of classes) {
      const color = CLASS_CONFIG[cls].color;

      // p95-p99 area
      const area = d3.area<MetricsHistory>()
        .x(d => x(d.elapsed))
        .y0(d => y(d[cls].latency_p95_ms))
        .y1(d => y(d[cls].latency_p99_ms))
        .curve(d3.curveMonotoneX);

      g.append('path')
        .datum(history)
        .attr('fill', color)
        .attr('fill-opacity', 0.08)
        .attr('d', area);

      // avg line
      const line = d3.line<MetricsHistory>()
        .x(d => x(d.elapsed))
        .y(d => y(d[cls].latency_avg_ms))
        .curve(d3.curveMonotoneX);

      g.append('path')
        .datum(history)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 1.5)
        .attr('d', line);
    }
  }, [history, propHeight]);

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  return (
    <div className="glass-card p-5">
      <h3 className="label-sm mb-4">Latency · avg with p95–p99 band</h3>
      <div ref={containerRef} className="w-full">
        <svg ref={svgRef} className="w-full" />
      </div>
    </div>
  );
}
