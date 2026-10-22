import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import Layout from './components/Layout';
import Hero from './components/Hero';
import ClassCards from './components/ClassCards';
import ControlRoom from './components/ControlRoom';
import ThroughputChart from './components/ThroughputChart';
import LatencyChart from './components/LatencyChart';
import JitterLossChart from './components/JitterLossChart';
import FairnessPanel from './components/FairnessPanel';
import Timeline from './components/Timeline';
import ExperimentsPanel from './components/ExperimentsPanel';
import { useWebSocket } from './hooks/useWebSocket';
import { useApi } from './hooks/useApi';
import type { PolicyMode, TrafficClass, RunInfo } from './types';
import './index.css';

const sectionVariant = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: 'easeOut' as const },
  },
};

function Section({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.section
      className={className}
      variants={sectionVariant}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-60px' }}
    >
      {children}
    </motion.section>
  );
}

export default function App() {
  const { state, history, status, isSample } = useWebSocket();
  const api = useApi();
  const [runs, setRuns] = useState<RunInfo[]>([]);

  // Fetch runs on mount
  useEffect(() => {
    api.getRuns().then(setRuns).catch(() => {});
    const interval = setInterval(() => {
      api.getRuns().then(setRuns).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [api]);

  // Policy changes for chart annotations
  const policyChanges = state.policy_log.map((pc) => ({
    elapsed: pc.elapsed_seconds,
    label: `${pc.old_policy} → ${pc.new_policy}`,
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
        setTimeout(() => api.getRuns().then(setRuns).catch(() => {}), 2000);
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
      ? `Utilisation crossed 85%, so Bulk was metered down and VoIP was promoted. Release when load stays under 70% for 10 s.`
      : state.bottleneck_utilization > 0.85
        ? `Bottleneck at ${(state.bottleneck_utilization * 100).toFixed(0)}% — consider switching to Adaptive policy.`
        : undefined;

  return (
    <Layout>
      {/* ── Nav ── */}
      <nav className="flex items-center justify-between py-5 sticky top-0 z-50 bg-[var(--ground)]/80 backdrop-blur-md" role="navigation" aria-label="Main navigation">
        <span className="font-display text-xl italic text-[var(--text)]">Priori</span>

        {/* Policy switcher - only show inline on desktop */}
        <div className="hidden md:block">
          {/* Inline policy tabs handled in ControlRoom */}
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 text-xs font-ui">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              status === 'connected' ? 'bg-[var(--voip)]' : 'bg-red-500'
            }`}
          />
          <span className="text-[var(--text-dim)] uppercase tracking-wider">
            {status === 'connected' ? 'Live' : 'Offline'}
            <span className="mx-1">·</span>
            {state.mode === 'simulation' ? 'Sim Mode' : 'Emulation'}
            {isSample && (
              <>
                <span className="mx-1">·</span>
                <span className="text-[var(--video)]">Sample Data</span>
              </>
            )}
          </span>
        </div>
      </nav>

      {/* ── Hero ── */}
      <Hero />

      {/* ── Class Cards ── */}
      <Section className="mb-8">
        <ClassCards
          metrics={state.metrics}
          throttled={
            state.policy === 'adaptive' && state.bottleneck_utilization > 0.85
              ? ['bulk']
              : []
          }
        />
      </Section>

      {/* ── Control Room ── */}
      <Section className="mb-8">
        <ControlRoom
          policy={state.policy}
          metrics={state.metrics}
          utilization={state.bottleneck_utilization}
          weights={state.policy_weights as Record<TrafficClass, number>}
          caps={state.policy_caps as Record<TrafficClass, number>}
          onPolicyChange={handlePolicyChange}
          onWeightsChange={handleWeightsChange}
          onCapsChange={handleCapsChange}
        />
      </Section>

      {/* ── Charts ── */}
      <Section className="mb-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ThroughputChart history={history} policyChanges={policyChanges} />
          <FairnessPanel
            jainIndex={state.jain_fairness_index}
            jainDemandNormalized={state.jain_demand_normalized}
            utilization={state.bottleneck_utilization}
            adaptiveMessage={adaptiveMsg}
          />
        </div>
      </Section>

      <Section className="mb-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <LatencyChart history={history} />
          <JitterLossChart history={history} />
        </div>
      </Section>

      {/* ── Timeline ── */}
      <Section className="mb-8">
        <Timeline changes={state.policy_log} />
      </Section>

      {/* ── Experiments ── */}
      <Section className="mb-16">
        <ExperimentsPanel
          runs={runs}
          running={state.running}
          onRunScenario={handleRunScenario}
          onExport={handleExport}
          onLoadRun={handleLoadRun}
        />
      </Section>

      {/* ── Footer ── */}
      <footer className="border-t border-[var(--border)] py-8 mb-4 text-center">
        <p className="text-xs text-[var(--text-dim)] font-ui">
          Priori — QoS Traffic Management System · CN Project
        </p>
      </footer>
    </Layout>
  );
}
