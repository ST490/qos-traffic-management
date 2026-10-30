import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import Layout from './components/Layout';
import Hero from './components/Hero';
import ClassCards from './components/ClassCards';
import PolicySwitcher from './components/PolicySwitcher';
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
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut' as const },
  },
};

function Section({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.section
      className={className}
      variants={sectionVariant}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-40px' }}
    >
      {children}
    </motion.section>
  );
}

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

  return (
    <Layout>
      {/* ── Top Navigation Bar ── */}
      <nav
        className="flex items-center justify-between py-6 mb-4 sticky top-0 z-50 bg-[#0B0B0C]/85 backdrop-blur-md border-b border-white/[0.04]"
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Brand logo */}
        <span className="font-display text-2xl md:text-3xl tracking-tight text-[#F2F0EA] select-none">
          Priori
        </span>

        {/* Center Pill Policy Switcher */}
        <div className="hidden sm:block">
          <PolicySwitcher active={state.policy} onChange={handlePolicyChange} />
        </div>

        {/* Live Status indicator */}
        <div className="flex items-center gap-2.5 text-xs font-mono">
          <span
            className={`w-2 h-2 rounded-full ${
              status === 'connected'
                ? 'bg-[#C6FF3D] shadow-[0_0_8px_#C6FF3D]'
                : 'bg-red-500 shadow-[0_0_8px_#ef4444]'
            }`}
          />
          <span className="text-[#8A8880] uppercase tracking-wider text-[0.6875rem]">
            {status === 'connected' ? 'LIVE' : 'OFFLINE'}
            <span className="mx-1 text-[#3A3A40]">·</span>
            {state.mode === 'simulation' ? 'SIM MODE' : 'EMULATION'}
            {isSample && (
              <>
                <span className="mx-1 text-[#3A3A40]">·</span>
                <span className="text-[#FF7A45]">SAMPLE DATA</span>
              </>
            )}
          </span>
        </div>
      </nav>

      {/* Mobile policy switcher */}
      <div className="sm:hidden mb-6 flex justify-center">
        <PolicySwitcher active={state.policy} onChange={handlePolicyChange} />
      </div>

      {/* Main Content Sections with Generous Spacing */}
      <div className="space-y-10 md:space-y-12 pb-16">
        {/* ── Hero with ReactBits Crosshair ── */}
        <Hero />

        {/* ── Four Class Metrics Cards ── */}
        <Section>
          <ClassCards
            metrics={state.metrics}
            throttled={
              state.policy === 'adaptive' && state.bottleneck_utilization > 0.85
                ? ['bulk']
                : []
            }
          />
        </Section>

        {/* ── Primary Charts: Throughput & Jain's Fairness ── */}
        <Section>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 md:gap-6">
            <ThroughputChart history={history} policyChanges={policyChanges} />
            <FairnessPanel
              jainIndex={state.jain_fairness_index}
              jainDemandNormalized={state.jain_demand_normalized}
              utilization={state.bottleneck_utilization}
              adaptiveMessage={adaptiveMsg}
            />
          </div>
        </Section>

        {/* ── Control Room: Topology & Queue Tuning ── */}
        <Section>
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

        {/* ── Secondary Charts: Latency & Jitter/Loss ── */}
        <Section>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 md:gap-6">
            <LatencyChart history={history} />
            <JitterLossChart history={history} />
          </div>
        </Section>

        {/* ── Timeline Audit Trail ── */}
        <Section>
          <Timeline changes={state.policy_log} />
        </Section>

        {/* ── Automated Experiment Benchmarks ── */}
        <Section>
          <ExperimentsPanel
            runs={runs}
            running={state.running}
            onRunScenario={handleRunScenario}
            onExport={handleExport}
            onLoadRun={handleLoadRun}
          />
        </Section>
      </div>

      {/* ── Footer ── */}
      <footer className="border-t border-[#1a1a20] py-8 text-center text-xs font-mono text-[#8A8880]">
        Priori — QoS Traffic Management System · OpenFlow 1.3 / Pure-Python Simulation Mode
      </footer>
    </Layout>
  );
}
