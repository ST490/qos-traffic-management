import { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import type { MetricsHistory, TrafficClass } from '../types';
import { CLASS_CONFIG } from '../types';

interface ThroughputChartProps {
  history: MetricsHistory[];
  policyChanges?: { elapsed: number; label: string }[];
  height?: number;
  className?: string;
}

const classes: TrafficClass[] = ['voip', 'video', 'web', 'bulk'];

export default function ThroughputChart({
  history,
  policyChanges = [],
  height: propHeight,
  className = '',
}: ThroughputChartProps) {
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

    const g = sel
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    if (history.length === 0) {
      g.append('text')
        .attr('x', innerW / 2)
        .attr('y', innerH / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#8A8880')
        .attr('font-family', 'Inter Tight')
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

    // Horizontal grid lines only
    g.append('g')
      .attr('class', 'grid')
      .call(
        d3.axisLeft(y).ticks(4).tickSize(-innerW).tickFormat(() => '')
      )
      .selectAll('line')
      .attr('stroke', '#1a1a20')
      .attr('stroke-dasharray', '3,4');
    g.selectAll('.grid .domain').remove();

    // X Axis
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat((d) => `${d}s`))
      .selectAll('text')
      .attr('fill', '#6E6D66')
      .attr('font-family', 'JetBrains Mono')
      .attr('font-size', 10);

    // Y Axis
    g.append('g')
      .call(d3.axisLeft(y).ticks(4).tickFormat((d) => `${d}`))
      .selectAll('text')
      .attr('fill', '#6E6D66')
      .attr('font-family', 'JetBrains Mono')
      .attr('font-size', 10);

    g.selectAll('.domain').attr('stroke', '#1e1e24');
    g.selectAll('.tick line').attr('stroke', '#1e1e24');

    // Lines per traffic class
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
        .attr('stroke-width', 2.2)
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
          .attr('stroke', '#8A8880')
          .attr('stroke-dasharray', '4,4')
          .attr('stroke-width', 1.2);

        g.append('text')
          .attr('x', px + 4)
          .attr('y', 10)
          .attr('fill', '#9B9990')
          .attr('font-size', 9)
          .attr('font-family', 'JetBrains Mono')
          .text(pc.label);
      }
    }

    // Interactive Hover Tooltip
    const tooltip = sel.append('g').attr('display', 'none');
    const tooltipLine = tooltip
      .append('line')
      .attr('y1', margin.top)
      .attr('y2', height - margin.bottom)
      .attr('stroke', '#F2F0EA')
      .attr('stroke-dasharray', '2,2')
      .attr('stroke-width', 0.8);

    const tooltipBg = tooltip
      .append('rect')
      .attr('fill', 'rgba(17,17,20,0.95)')
      .attr('rx', 8)
      .attr('stroke', '#282830');

    const tooltipText = tooltip.append('text')
      .attr('fill', '#F2F0EA')
      .attr('font-family', 'JetBrains Mono')
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
    <div className={`panel h-full ${className}`} data-crosshair-target>
      <div className="panel-head">
        <h3 className="panel-label">Throughput per class · last 60 s</h3>
        <span className="panel-note">Mbps</span>
      </div>

      <div ref={containerRef} className="plot">
        <svg ref={svgRef} className="w-full" />
      </div>

      <p className="panel-foot text-[var(--text-faint)]">
        {latestChange
          ? `Dashed line: policy escalated to ${latestChange.label} at t = ${latestChange.elapsed} s`
          : 'Dashed line: policy changes annotated in real time'}
      </p>
    </div>
  );
}
