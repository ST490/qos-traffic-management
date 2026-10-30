import { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import type { MetricsHistory, TrafficClass } from '../types';
import { CLASS_CONFIG } from '../types';

interface ThroughputChartProps {
  history: MetricsHistory[];
  policyChanges?: { elapsed: number; label: string }[];
  height?: number;
}

const classes: TrafficClass[] = ['voip', 'video', 'web', 'bulk'];

export default function ThroughputChart({
  history,
  policyChanges = [],
  height: propHeight = 260,
}: ThroughputChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const draw = useCallback(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg) return;

    const width = container.clientWidth || 400;
    const height = propHeight;
    const margin = { top: 16, right: 20, bottom: 26, left: 42 };
    const innerW = Math.max(10, width - margin.left - margin.right);
    const innerH = Math.max(10, height - margin.top - margin.bottom);

    const sel = d3.select(svg);
    sel
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', '100%')
      .attr('height', height);
    sel.selectAll('*').remove();

    const g = sel
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    if (history.length === 0) {
      g.append('text')
        .attr('x', innerW / 2)
        .attr('y', innerH / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', 'rgba(255,255,255,0.4)')
        .attr('font-family', 'Inter Tight, sans-serif')
        .attr('font-size', 12)
        .text('Awaiting stream telemetry…');
      return;
    }

    // Scales
    const xExtent = d3.extent(history, (d) => d.elapsed) as [number, number];
    const x = d3.scaleLinear().domain(xExtent).range([0, innerW]);

    const maxThroughput = d3.max(history, (d) =>
      Math.max(
        d.voip.throughput_mbps,
        d.video.throughput_mbps,
        d.web.throughput_mbps,
        d.bulk.throughput_mbps
      )
    ) ?? 10;
    const y = d3.scaleLinear().domain([0, Math.max(maxThroughput * 1.15, 4)]).range([innerH, 0]).nice();

    // Lighter grid lines (rgba(255,255,255,0.05))
    g.append('g')
      .attr('class', 'grid')
      .call(
        d3.axisLeft(y).ticks(4).tickSize(-innerW).tickFormat(() => '')
      )
      .selectAll('line')
      .attr('stroke', 'rgba(255,255,255,0.05)')
      .attr('stroke-dasharray', '3,4');
    g.selectAll('.grid .domain').remove();

    // X Axis: 11px muted with margin
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat((d) => `${d}s`))
      .selectAll('text')
      .attr('fill', 'rgba(255,255,255,0.45)')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', 11)
      .attr('dy', '10px');

    // Y Axis: 11px muted
    g.append('g')
      .call(d3.axisLeft(y).ticks(4).tickFormat((d) => `${d}`))
      .selectAll('text')
      .attr('fill', 'rgba(255,255,255,0.45)')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', 11)
      .attr('dx', '-4px');

    g.selectAll('.domain').attr('stroke', 'rgba(255,255,255,0.08)');
    g.selectAll('.tick line').attr('stroke', 'rgba(255,255,255,0.08)');

    // Thinner 2px smooth lines
    for (const cls of classes) {
      const color = CLASS_CONFIG[cls].color;
      const line = d3
        .line<MetricsHistory>()
        .x((d) => x(d.elapsed))
        .y((d) => y(d[cls].throughput_mbps))
        .curve(d3.curveMonotoneX);

      g.append('path')
        .datum(history)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 2)
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round')
        .attr('d', line);
    }

    // Policy change vertical event lines
    for (const pc of policyChanges) {
      if (pc.elapsed >= xExtent[0] && pc.elapsed <= xExtent[1]) {
        const px = x(pc.elapsed);
        g.append('line')
          .attr('x1', px).attr('x2', px)
          .attr('y1', 0).attr('y2', innerH)
          .attr('stroke', 'rgba(255,255,255,0.3)')
          .attr('stroke-dasharray', '4,4')
          .attr('stroke-width', 1);

        g.append('text')
          .attr('x', px + 4)
          .attr('y', 10)
          .attr('fill', 'rgba(255,255,255,0.7)')
          .attr('font-size', 10)
          .attr('font-family', 'JetBrains Mono, monospace')
          .text(pc.label);
      }
    }

    // Interactive Hover Tooltip
    const tooltip = sel.append('g').attr('display', 'none');
    const tooltipLine = tooltip
      .append('line')
      .attr('y1', margin.top)
      .attr('y2', height - margin.bottom)
      .attr('stroke', '#F3F4F6')
      .attr('stroke-dasharray', '2,2')
      .attr('stroke-width', 0.8);

    const tooltipBg = tooltip
      .append('rect')
      .attr('fill', 'rgba(17,19,24,0.96)')
      .attr('rx', 8)
      .attr('stroke', 'rgba(255,255,255,0.12)');

    const tooltipText = tooltip.append('text')
      .attr('fill', '#F3F4F6')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', 10);

    sel.on('mousemove', (event) => {
      const [mx] = d3.pointer(event);
      const mxInner = mx - margin.left;
      if (mxInner < 0 || mxInner > innerW) {
        tooltip.attr('display', 'none');
        return;
      }
      tooltip.attr('display', null);
      const elapsed = x.invert(mxInner);
      const closest = history.reduce((prev, curr) =>
        Math.abs(curr.elapsed - elapsed) < Math.abs(prev.elapsed - elapsed) ? curr : prev
      );

      tooltipLine.attr('x1', mx).attr('x2', mx);

      const lines = classes.map(
        (cls) => `${cls.toUpperCase()}: ${closest[cls].throughput_mbps.toFixed(2)} Mbps`
      );
      tooltipText.selectAll('tspan').remove();
      lines.forEach((line, i) => {
        tooltipText
          .append('tspan')
          .attr('x', mx + 14)
          .attr('y', margin.top + 20 + i * 15)
          .attr('fill', CLASS_CONFIG[classes[i]].color)
          .text(line);
      });

      tooltipBg
        .attr('x', mx + 6)
        .attr('y', margin.top + 4)
        .attr('width', 160)
        .attr('height', lines.length * 15 + 14);
    });

    sel.on('mouseleave', () => tooltip.attr('display', 'none'));
  }, [history, policyChanges, propHeight]);

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  const latestChange = policyChanges.length > 0 ? policyChanges[policyChanges.length - 1] : null;

  return (
    <div
      className="card-surface p-5 sm:p-6 flex flex-col justify-between h-full min-w-0 w-full"
      data-crosshair-target
    >
      <div>
        {/* Title: 12px, uppercase, letter-spacing 0.08em, weight 600, color rgba(255,255,255,0.55) */}
        <h3 className="card-title text-xs font-semibold tracking-wider text-white/55 mb-4">
          THROUGHPUT PER CLASS · LAST 60 S
        </h3>

        {/* Chart SVG wrapper with overflow hidden & min-w-0 */}
        <div ref={containerRef} className="w-full min-w-0 overflow-hidden">
          <svg ref={svgRef} className="w-full h-auto block" />
        </div>
      </div>

      {/* Footer pinned with 16px top padding and subtle divider */}
      <div className="mt-6 pt-4 border-t border-white/[0.06] text-xs font-mono text-white/45">
        {latestChange
          ? `Dashed line: policy escalated to ${latestChange.label} at t = ${latestChange.elapsed} s`
          : 'Dashed line: policy changes annotated in real time'}
      </div>
    </div>
  );
}
