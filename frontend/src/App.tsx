import { useState, useEffect, useCallback } from 'react';
import Layout from './components/Layout';
import Hero from './components/Hero';
import ClassCards from './components/ClassCards';
import PolicySwitcher from './components/PolicySwitcher';
import ControlRoom from './components/ControlRoom';
import TopologyView from './components/TopologyView';
import ThroughputChart from './components/ThroughputChart';
import LatencyChart from './components/LatencyChart';
import JitterLossChart from './components/JitterLossChart';
import FairnessPanel from './components/FairnessPanel';
import Timeline from './components/Timeline';
import ExperimentsPanel from './components/ExperimentsPanel';
import RunRepository from './components/RunRepository';
import { useWebSocket } from './hooks/useWebSocket';
import { useApi } from './hooks/useApi';
import type { PolicyMode, TrafficClass, RunInfo } from './types';
import './index.css';

export default function App() {
  const { state, history, status, isSample } = useWebSocket();
  const api = useApi();
  const [runs, setRuns] = useState<RunInfo[]>([]);

  // Fetch runs on mount & periodically
  useEffect(() => {
    api.getRuns().then(setRuns).catch(() => {});
    const interval = setInterval(() => {
      api.getRuns().then(setRuns).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [api]);

  // Policy change markers for charts
  const policyChanges = state.policy_log.map((pc) => ({
    elapsed: pc.elapsed_seconds,
    label: `${pc.old_policy.toUpperCase()} → ${pc.new_policy.toUpperCase()}`,
  }));

  const handlePolicyChange = useCallback(
    async (mode: PolicyMode) => {
      try {
        await api.changePolicy(mode);
      } catch (e) {
        console.error('Failed to change policy:', e);
      }
    },
    [api]
  );

  const handleWeightsChange = useCallback(
    async (weights: Record<TrafficClass, number>) => {
      try {
        await api.changePolicy(state.policy, weights);
      } catch (e) {
        console.error('Failed to update weights:', e);
      }
    },
    [api, state.policy]
  );

  const handleCapsChange = useCallback(
    async (caps: Record<TrafficClass, number>) => {
      try {
        await api.changePolicy(state.policy, undefined, caps);
      } catch (e) {
        console.error('Failed to update caps:', e);
      }
    },
    [api, state.policy]
  );

  const handleRunScenario = useCallback(
    async (name: string) => {
      try {
        await api.runScenario(name);
        setTimeout(() => api.getRuns().then(setRuns).catch(() => {}), 1500);
      } catch (e) {
        console.error('Failed to run scenario:', e);
      }
    },
    [api]
  );

  const handleExport = useCallback(
    (runId: string, format: 'csv' | 'json') => {
      api.exportRun(runId, format);
    },
    [api]
  );

  const handleLoadRun = useCallback(
    async (runId: string) => {
      try {
        await api.getMetrics(runId);
      } catch (e) {
        console.error('Failed to load run:', e);
      }
    },
    [api]
  );

  // Adaptive message
  const adaptiveMsg =
    state.policy === 'adaptive' && state.bottleneck_utilization > 0.85
      ? 'Utilisation crossed 85%, so Bulk was metered down and VoIP was promoted. Release when load stays under 70% for 10 s.'
      : state.bottleneck_utilization > 0.85
        ? `Bottleneck at ${(state.bottleneck_utilization * 100).toFixed(0)}% — consider switching to Adaptive policy.`
        : undefined;

  const connected = status === 'connected';

  return (
    <Layout
      header={
        <>
          <span className="select-none font-display text-xl leading-none tracking-tight text-[var(--text)] md:justify-self-start">
            Priori
          </span>

          <div className="hidden md:flex md:justify-self-center">
            <PolicySwitcher
              id="nav"
              active={state.policy}
              onChange={handlePolicyChange}
            />
          </div>

          <div className="flex items-center gap-2 font-mono text-[0.6875rem] md:justify-self-end">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                connected ? 'bg-[var(--voip)] text-[var(--voip)]' : 'bg-red-500 text-red-500'
              } shadow-[0_0_6px_currentColor]`}
              aria-hidden="true"
            />
            <span className="flex items-center gap-1.5 uppercase tracking-[0.14em] text-[var(--text-dim)]">
              <span className={connected ? 'text-[var(--text)]' : 'text-red-400'}>
                {connected ? 'Live' : 'Offline'}
              </span>
              <span className="text-[var(--border-strong)]" aria-hidden="true">
                /
              </span>
              <span>{state.mode === 'simulation' ? 'Sim' : 'Emu'}</span>
              {isSample && (
                <>
                  <span className="text-[var(--border-strong)]" aria-hidden="true">
                    /
                  </span>
                  <span className="text-[var(--video)]">Sample</span>
                </>
              )}
            </span>
          </div>
        </>
      }
    >
      <Hero />

      <div className="page-stack mt-[var(--band-loose)]">
        {/* Policy switcher for anything narrower than the header pill */}
        <div className="md:hidden">
          <PolicySwitcher
            id="inline"
            variant="full"
            active={state.policy}
            onChange={handlePolicyChange}
          />
        </div>

        {/* ── Live class metrics ── */}
        <ClassCards
          metrics={state.metrics}
          throttled={
            state.policy === 'adaptive' && state.bottleneck_utilization > 0.85
              ? ['bulk']
              : []
          }
        />

        {/* ── Link health: throughput over the whole window, fairness of its split ── */}
        <div className="band-grid">
          <ThroughputChart
            className="md:col-span-6 lg:col-span-8"
            history={history}
            policyChanges={policyChanges}
          />
          <FairnessPanel
            className="md:col-span-6 lg:col-span-4"
            jainIndex={state.jain_fairness_index}
            jainDemandNormalized={state.jain_demand_normalized}
            utilization={state.bottleneck_utilization}
            adaptiveMessage={adaptiveMsg}
          />
        </div>

        {/* ── Where the bottleneck is, and how it is being shaped ── */}
        <div className="band-grid">
          <TopologyView
            className="lg:col-span-6 xl:col-span-5"
            metrics={state.metrics}
            utilization={state.bottleneck_utilization}
            policy={state.policy}
          />
          <ControlRoom
            className="lg:col-span-6 xl:col-span-7"
            policy={state.policy}
            metrics={state.metrics}
            utilization={state.bottleneck_utilization}
            weights={state.policy_weights as Record<TrafficClass, number>}
            caps={state.policy_caps as Record<TrafficClass, number>}
            onWeightsChange={handleWeightsChange}
            onCapsChange={handleCapsChange}
          />
        </div>

        {/* ── Delay and jitter/loss on the secondary axes ── */}
        <div className="band-grid">
          <LatencyChart className="md:col-span-6" history={history} />
          <JitterLossChart className="md:col-span-6" history={history} />
        </div>

        {/* ── Benchmarks you can run, beside the audit trail of what ran ── */}
        <div className="band-grid">
          <ExperimentsPanel
            className="lg:col-span-8"
            running={state.running}
            onRunScenario={handleRunScenario}
          />
          <Timeline className="lg:col-span-4" changes={state.policy_log} />
        </div>

        {/* ── Persisted runs ── */}
        <RunRepository runs={runs} onExport={handleExport} onLoadRun={handleLoadRun} />
      </div>
    </Layout>
  );
}
