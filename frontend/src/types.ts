export type TrafficClass = 'voip' | 'video' | 'web' | 'bulk';
export type PolicyMode = 'fifo' | 'priority' | 'weighted' | 'adaptive';

export interface ClassMetrics {
  traffic_class: TrafficClass;
  throughput_mbps: number;
  latency_avg_ms: number;
  latency_p95_ms: number;
  latency_p99_ms: number;
  jitter_ms: number;
  loss_percent: number;
  packets_sent: number;
  packets_received: number;
  packets_lost: number;
  bytes_received: number;
}

export interface SystemState {
  mode: 'simulation' | 'emulation';
  policy: PolicyMode;
  running: boolean;
  run_id: string;
  elapsed_seconds: number;
  bottleneck_utilization: number;
  jain_fairness_index: number;
  jain_demand_normalized: number;
  metrics: Record<TrafficClass, ClassMetrics>;
  policy_weights: Record<TrafficClass, number>;
  policy_caps: Record<TrafficClass, number>;
  policy_log: PolicyChange[];
  adaptive_state: Record<string, unknown>;
}

export interface PolicyChange {
  timestamp: number;
  elapsed_seconds: number;
  old_policy: string;
  new_policy: string;
  reason: string;
  weights_before?: Record<string, number>;
  weights_after?: Record<string, number>;
}

export interface MetricsHistory {
  timestamp: number;
  elapsed: number;
  voip: ClassMetrics;
  video: ClassMetrics;
  web: ClassMetrics;
  bulk: ClassMetrics;
  jain_index: number;
  utilization: number;
}

export interface RunInfo {
  run_id: string;
  started_at: string;
  ended_at?: string;
  scenario?: string;
  mode: string;
  initial_policy: string;
  duration_seconds: number;
  status: string;
}

export const TRAFFIC_CLASSES: TrafficClass[] = ['voip', 'video', 'web', 'bulk'];

export const CLASS_CONFIG: Record<
  TrafficClass,
  {
    color: string;
    label: string;
    port: number;
    dscp: string;
  }
> = {
  voip: { color: '#C6FF3D', label: 'VoIP · EF', port: 5001, dscp: 'EF' },
  video: { color: '#FF7A45', label: 'Video · AF41', port: 5002, dscp: 'AF41' },
  web: { color: '#6AA8FF', label: 'Web · AF21', port: 5003, dscp: 'AF21' },
  bulk: { color: '#B79CFF', label: 'Bulk · BE', port: 5004, dscp: 'BE' },
};

export const POLICY_LABELS: Record<PolicyMode, string> = {
  fifo: 'FIFO',
  priority: 'Priority',
  weighted: 'Weighted',
  adaptive: 'Adaptive',
};

export function emptyClassMetrics(tc: TrafficClass): ClassMetrics {
  return {
    traffic_class: tc,
    throughput_mbps: 0,
    latency_avg_ms: 0,
    latency_p95_ms: 0,
    latency_p99_ms: 0,
    jitter_ms: 0,
    loss_percent: 0,
    packets_sent: 0,
    packets_received: 0,
    packets_lost: 0,
    bytes_received: 0,
  };
}

export function emptySystemState(): SystemState {
  return {
    mode: 'simulation',
    policy: 'fifo',
    running: false,
    run_id: '',
    elapsed_seconds: 0,
    bottleneck_utilization: 0,
    jain_fairness_index: 0,
    jain_demand_normalized: 0,
    metrics: {
      voip: emptyClassMetrics('voip'),
      video: emptyClassMetrics('video'),
      web: emptyClassMetrics('web'),
      bulk: emptyClassMetrics('bulk'),
    },
    policy_weights: { voip: 0.4, video: 0.3, web: 0.2, bulk: 0.1 },
    policy_caps: { voip: 1, video: 1, web: 1, bulk: 1 },
    policy_log: [],
    adaptive_state: {},
  };
}

/** Generate sample data for demo / offline mode */
export function generateSampleState(elapsed: number): SystemState {
  const t = elapsed;
  const sin = (freq: number, phase = 0) =>
    Math.sin(t * freq * 0.1 + phase) * 0.5 + 0.5;

  const mkMetrics = (
    tc: TrafficClass,
    baseThroughput: number,
    baseLatency: number,
    baseLoss: number,
  ): ClassMetrics => ({
    traffic_class: tc,
    throughput_mbps: +(
      baseThroughput *
      (0.7 + 0.3 * sin(1, TRAFFIC_CLASSES.indexOf(tc)))
    ).toFixed(2),
    latency_avg_ms: +(
      baseLatency *
      (0.8 + 0.4 * sin(0.7, TRAFFIC_CLASSES.indexOf(tc) * 2))
    ).toFixed(2),
    latency_p95_ms: +(
      baseLatency *
      1.5 *
      (0.8 + 0.4 * sin(0.5, TRAFFIC_CLASSES.indexOf(tc) * 3))
    ).toFixed(2),
    latency_p99_ms: +(
      baseLatency *
      2 *
      (0.8 + 0.4 * sin(0.3, TRAFFIC_CLASSES.indexOf(tc) * 4))
    ).toFixed(2),
    jitter_ms: +(
      baseLatency *
      0.1 *
      (0.5 + sin(1.2, TRAFFIC_CLASSES.indexOf(tc)))
    ).toFixed(2),
    loss_percent: +(
      baseLoss *
      (0.5 + sin(0.4, TRAFFIC_CLASSES.indexOf(tc)))
    ).toFixed(3),
    packets_sent: Math.floor(baseThroughput * 1000 * (1 + t * 0.1)),
    packets_received: Math.floor(
      baseThroughput * 1000 * (1 + t * 0.1) * (1 - baseLoss * 0.01),
    ),
    packets_lost: Math.floor(
      baseThroughput * 1000 * (1 + t * 0.1) * baseLoss * 0.01,
    ),
    bytes_received: Math.floor(baseThroughput * 125000 * (1 + t * 0.1)),
  });

  return {
    mode: 'simulation',
    policy: 'weighted',
    running: true,
    run_id: 'sample-run-001',
    elapsed_seconds: elapsed,
    bottleneck_utilization: +(0.6 + 0.25 * sin(0.3)).toFixed(3),
    jain_fairness_index: +(0.7 + 0.25 * sin(0.2, 1)).toFixed(4),
    jain_demand_normalized: +(0.65 + 0.2 * sin(0.15, 2)).toFixed(4),
    metrics: {
      voip: mkMetrics('voip', 2.5, 8, 0.05),
      video: mkMetrics('video', 12, 25, 0.3),
      web: mkMetrics('web', 6, 40, 0.5),
      bulk: mkMetrics('bulk', 4, 80, 1.2),
    },
    policy_weights: { voip: 0.4, video: 0.3, web: 0.2, bulk: 0.1 },
    policy_caps: { voip: 1, video: 1, web: 1, bulk: 1 },
    policy_log: [],
    adaptive_state: {},
  };
}
