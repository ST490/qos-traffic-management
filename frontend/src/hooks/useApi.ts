import { useCallback } from 'react';
import type { PolicyMode, RunInfo, TrafficClass } from '../types';

const API_BASE = '/api';

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

export function useApi() {
  const changePolicy = useCallback(
    (
      mode: PolicyMode,
      weights?: Record<TrafficClass, number>,
      caps?: Record<TrafficClass, number>,
    ) =>
      request('/policy', {
        method: 'POST',
        body: JSON.stringify({ mode, weights, caps }),
      }),
    [],
  );

  const changeTraffic = useCallback(
    (
      trafficClass: TrafficClass,
      params: { rate_mbps?: number; burst?: number },
    ) =>
      request(`/traffic/${trafficClass}`, {
        method: 'POST',
        body: JSON.stringify(params),
      }),
    [],
  );

  const runScenario = useCallback(
    (name: string) =>
      request('/scenario', {
        method: 'POST',
        body: JSON.stringify({ scenario: name }),
      }),
    [],
  );

  const startSimulation = useCallback(
    (params: {
      policy?: PolicyMode;
      duration_seconds?: number;
      scenario?: string;
    }) =>
      request('/simulation/start', {
        method: 'POST',
        body: JSON.stringify(params),
      }),
    [],
  );

  const stopSimulation = useCallback(
    () =>
      request('/simulation/stop', {
        method: 'POST',
      }),
    [],
  );

  const getRuns = useCallback(
    () => request<RunInfo[]>('/runs'),
    [],
  );

  const getMetrics = useCallback(
    (runId: string) => request(`/runs/${runId}/metrics`),
    [],
  );

  const exportRun = useCallback(
    (runId: string, format: 'csv' | 'json') => {
      window.open(`${API_BASE}/runs/${runId}/export?format=${format}`, '_blank');
    },
    [],
  );

  return {
    changePolicy,
    changeTraffic,
    runScenario,
    startSimulation,
    stopSimulation,
    getRuns,
    getMetrics,
    exportRun,
  };
}
