import { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import type { MetricsHistory, TrafficClass } from '../types';
import { CLASS_CONFIG } from '../types';

interface LatencyChartProps {
  history: MetricsHistory[];
  height?: number;
  className?: string;
}

const classes: TrafficClass[] = ['voip', 'video', 'web', 'bulk'];

export default function LatencyChart({ history, height: propHeight, className = '' }: LatencyChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const draw = useCallback(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg) return;

    const width = container.clientWidth;
    const height = propHeight ?? container.clientHeight;
    const margin = { top: 16, right: 16, bottom: 28, left: 36 };
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

    const maxLatency = d3.max(history, d =>
      Math.max(...classes.map(c => d[c].latency_p99_ms))
    ) ?? 100;
    const y = d3.scaleLinear().domain([0, Math.max(maxLatency * 1.15, 30)]).range([innerH, 0]).nice();

    // Grid lines
    g.append('g').call(d3.axisLeft(y).ticks(4).tickSize(-innerW).tickFormat(() => ''))
      .selectAll('line').attr('stroke', '#1a1a20').attr('stroke-dasharray', '3,4');
    g.selectAll('.domain').remove();

    // X axis
    g.append('g').attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d => `${d}s`))
      .selectAll('text').attr('fill', '#6E6D66').attr('font-family', 'JetBrains Mono').attr('font-size', 10);

    // Y axis
    g.append('g').call(d3.axisLeft(y).ticks(4).tickFormat(d => `${d}ms`))
      .selectAll('text').attr('fill', '#6E6D66').attr('font-family', 'JetBrains Mono').attr('font-size', 10);

    g.selectAll('.domain').attr('stroke', '#1e1e24');
    g.selectAll('.tick line').attr('stroke', '#1e1e24');

    // Area for p95-p99 range, then line for avg
    for (const cls of classes) {
      const color = CLASS_CONFIG[cls].color;

      const area = d3.area<MetricsHistory>()
        .x(d => x(d.elapsed))
        .y0(d => y(d[cls].latency_p95_ms))
        .y1(d => y(d[cls].latency_p99_ms))
        .curve(d3.curveMonotoneX);

      g.append('path')
        .datum(history)
        .attr('fill', color)
        .attr('fill-opacity', 0.1)
        .attr('d', area);

      const line = d3.line<MetricsHistory>()
        .x(d => x(d.elapsed))
        .y(d => y(d[cls].latency_avg_ms))
        .curve(d3.curveMonotoneX);

      g.append('path')
        .datum(history)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 2)
        .attr('stroke-linecap', 'round')
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
    <div className={`panel h-full ${className}`} data-crosshair-target>
      <div className="panel-head">
        <h3 className="panel-label">One-way delay &amp; bufferbloat (ms)</h3>
        <span className="panel-note">Avg with p95–p99 band</span>
      </div>

      <div ref={containerRef} className="plot">
        <svg ref={svgRef} className="w-full" />
      </div>

      <p className="panel-foot text-[var(--text-faint)]">
        Priority flows maintain ~20 ms wire delay during severe link congestion.
      </p>
    </div>
  );
}
