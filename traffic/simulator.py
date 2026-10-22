"""
Core simulation engine for the QoS Traffic Management System.

Models the topology: h1-h4 → s1 → bottleneck (10 Mbps / 20 ms / 100-pkt queue) → s2 → h5-h8
Implements FIFO, Strict Priority, Weighted Fair Queuing, and Adaptive scheduling.
Uses an event-driven architecture with heapq for packet-level simulation.
"""
from __future__ import annotations

import heapq
import math
import random
import threading
import time
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional, Tuple

from .models import (
    FlowMetrics,
    PolicyChange,
    PolicyMode,
    SystemState,
    TrafficClass,
    TRAFFIC_CLASS_CONFIG,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
BOTTLENECK_BW_BPS: float = 10e6       # 10 Mbps
PROPAGATION_DELAY_S: float = 0.020    # 20 ms
QUEUE_LIMIT_PKTS: int = 100           # max packets in queue

PRIORITY_ORDER: List[TrafficClass] = [
    TrafficClass.VOIP,
    TrafficClass.VIDEO,
    TrafficClass.WEB,
    TrafficClass.BULK,
]

CLASS_INDEX = {tc: idx for idx, tc in enumerate(PRIORITY_ORDER)}

DEFAULT_WEIGHTS: Dict[str, float] = {"voip": 40, "video": 30, "web": 20, "bulk": 10}
DEFAULT_CAPS: Dict[str, float] = {"voip": 100, "video": 100, "web": 100, "bulk": 100}

ADAPTIVE_HIGH_UTIL: float = 0.85
ADAPTIVE_LOW_UTIL: float = 0.70
ADAPTIVE_LOSS_THRESHOLD: float = 0.02
ADAPTIVE_HYSTERESIS_S: float = 10.0


# ---------------------------------------------------------------------------
# Simulation packet
# ---------------------------------------------------------------------------
@dataclass(order=False)
class SimPacket:
    """A single simulated packet flowing through the network."""
    send_time: float          # absolute simulation time of creation
    size_bytes: int           # packet size in bytes
    traffic_class: TrafficClass
    seq_num: int
    flow_id: int
    enqueue_time: float = 0.0 # time when placed in bottleneck queue
    dequeue_time: float = 0.0 # time when transmission starts
    receive_time: float = 0.0 # arrival time at receiver
    dropped: bool = False


# ---------------------------------------------------------------------------
# Event types for the heap
# ---------------------------------------------------------------------------
EVENT_PKT_ARRIVAL = 0   # packet arrives at the bottleneck ingress
EVENT_LINK_FREE = 1     # bottleneck finishes transmitting a packet
EVENT_TICK = 2          # 1-second metrics collection tick
EVENT_ADAPTIVE = 3      # adaptive policy check
EVENT_STOP = 99         # sentinel to end simulation

@dataclass(order=True)
class SimEvent:
    """Priority-queue event keyed on time, then type, then a tiebreaker."""
    time: float
    etype: int = field(compare=True)
    tie: int = field(default=0, compare=True)
    packet: Optional[SimPacket] = field(default=None, compare=False)


# ---------------------------------------------------------------------------
# Per-class per-second accumulator
# ---------------------------------------------------------------------------
class _SecondBucket:
    """Accumulates stats for one traffic class during one wall-second."""

    def __init__(self) -> None:
        self.pkts_sent: int = 0
        self.pkts_rcvd: int = 0
        self.pkts_dropped: int = 0
        self.bytes_rcvd: int = 0
        self.latencies: List[float] = []
        self.prev_arrival: Optional[float] = None
        self.jitter_acc: float = 0.0       # RFC 3550 running jitter
        self._jitter_initialized: bool = False

    def record_sent(self) -> None:
        self.pkts_sent += 1

    def record_drop(self) -> None:
        self.pkts_dropped += 1

    def record_receive(self, pkt: SimPacket) -> None:
        self.pkts_rcvd += 1
        self.bytes_rcvd += pkt.size_bytes
        latency_s = pkt.receive_time - pkt.send_time
        self.latencies.append(latency_s)
        # RFC 3550 jitter (EWMA of inter-arrival difference)
        if self.prev_arrival is not None:
            transit_diff = abs(
                (pkt.receive_time - pkt.send_time)
                - (self.prev_arrival - pkt.send_time)
            )
            if not self._jitter_initialized:
                self.jitter_acc = transit_diff
                self._jitter_initialized = True
            else:
                self.jitter_acc += (transit_diff - self.jitter_acc) / 16.0
        self.prev_arrival = pkt.receive_time

    def to_metrics(self, ts: float, tc_name: str) -> FlowMetrics:
        latencies_ms = [l * 1000.0 for l in sorted(self.latencies)] if self.latencies else []
        n = len(latencies_ms)
        avg_lat = sum(latencies_ms) / n if n else 0.0
        p95 = latencies_ms[int(n * 0.95)] if n > 1 else (latencies_ms[0] if n else 0.0)
        p99 = latencies_ms[int(n * 0.99)] if n > 1 else (latencies_ms[0] if n else 0.0)
        throughput = (self.bytes_rcvd * 8) / 1e6  # bits in 1 second → Mbps
        loss = (self.pkts_dropped / self.pkts_sent * 100.0) if self.pkts_sent else 0.0
        return FlowMetrics(
            timestamp=ts,
            traffic_class=tc_name,
            throughput_mbps=round(throughput, 4),
            latency_avg_ms=round(avg_lat, 3),
            latency_p95_ms=round(p95, 3),
            latency_p99_ms=round(p99, 3),
            jitter_ms=round(self.jitter_acc * 1000.0, 3),
            loss_percent=round(loss, 2),
            packets_sent=self.pkts_sent,
            packets_received=self.pkts_rcvd,
            packets_lost=self.pkts_dropped,
            bytes_received=self.bytes_rcvd,
        )


# ---------------------------------------------------------------------------
# Bottleneck link with scheduling
# ---------------------------------------------------------------------------
class BottleneckLink:
    """
    Models a 10 Mbps bottleneck with a 100-packet queue and pluggable
    scheduling discipline.
    """

    def __init__(self) -> None:
        self.capacity_bps: float = BOTTLENECK_BW_BPS
        self.prop_delay: float = PROPAGATION_DELAY_S
        self.queue_limit: int = QUEUE_LIMIT_PKTS

        # Per-class sub-queues (always maintained; scheduling picks from them)
        self.queues: Dict[TrafficClass, List[SimPacket]] = {tc: [] for tc in PRIORITY_ORDER}
        self.total_queued: int = 0

        self.busy_until: float = 0.0  # time when the link becomes idle

        # Scheduling state
        self.policy: PolicyMode = PolicyMode.FIFO
        self.weights: Dict[str, float] = dict(DEFAULT_WEIGHTS)
        self.caps: Dict[str, float] = dict(DEFAULT_CAPS)

        # WFQ deficit counters (in bytes)
        self._deficit: Dict[TrafficClass, float] = {tc: 0.0 for tc in PRIORITY_ORDER}

        # Metering for adaptive (fraction of demand to admit; 1.0 = no throttle)
        self.meter: Dict[TrafficClass, float] = {tc: 1.0 for tc in PRIORITY_ORDER}

        # FIFO ordering tiebreaker
        self._fifo_seq: int = 0

        # FIFO flat queue (used only in FIFO mode for ordering)
        self._fifo_queue: List[Tuple[int, SimPacket]] = []

    # ---- enqueue ----
    def enqueue(self, pkt: SimPacket, now: float) -> bool:
        """Try to enqueue a packet. Returns True if accepted, False if dropped."""
        # Adaptive metering: probabilistically drop
        if self.policy == PolicyMode.ADAPTIVE:
            m = self.meter.get(pkt.traffic_class, 1.0)
            if m < 1.0 and random.random() > m:
                return False

        if self.total_queued >= self.queue_limit:
            return False

        pkt.enqueue_time = now
        self.queues[pkt.traffic_class].append(pkt)
        self.total_queued += 1

        if self.policy == PolicyMode.FIFO:
            self._fifo_queue.append((self._fifo_seq, pkt))
            self._fifo_seq += 1

        return True

    # ---- dequeue ----
    def dequeue(self) -> Optional[SimPacket]:
        """Remove and return the next packet according to the active policy."""
        if self.total_queued == 0:
            return None

        pkt: Optional[SimPacket] = None

        if self.policy == PolicyMode.FIFO:
            pkt = self._dequeue_fifo()
        elif self.policy == PolicyMode.PRIORITY:
            pkt = self._dequeue_priority()
        elif self.policy in (PolicyMode.WEIGHTED, PolicyMode.ADAPTIVE):
            pkt = self._dequeue_weighted()

        if pkt is not None:
            self.total_queued -= 1
        return pkt

    def _dequeue_fifo(self) -> Optional[SimPacket]:
        if not self._fifo_queue:
            return None
        _, pkt = self._fifo_queue.pop(0)
        self.queues[pkt.traffic_class].remove(pkt)
        return pkt

    def _dequeue_priority(self) -> Optional[SimPacket]:
        for tc in PRIORITY_ORDER:
            if self.queues[tc]:
                return self.queues[tc].pop(0)
        return None

    def _dequeue_weighted(self) -> Optional[SimPacket]:
        """
        Deficit-round-robin style weighted fair queuing.
        Each round adds weight-proportional quantum to deficit counters.
        Work-conserving: if a class is empty, its quantum is redistributed.
        """
        total_weight = sum(self.weights.get(tc.value, 10) for tc in PRIORITY_ORDER)
        if total_weight == 0:
            total_weight = 1

        # Try up to 2 full rounds
        for _ in range(2 * len(PRIORITY_ORDER)):
            for tc in PRIORITY_ORDER:
                if not self.queues[tc]:
                    continue
                w = self.weights.get(tc.value, 10)
                quantum = (w / total_weight) * 1500 * len(PRIORITY_ORDER)
                self._deficit[tc] += quantum
                while self.queues[tc] and self._deficit[tc] >= self.queues[tc][0].size_bytes:
                    pkt = self.queues[tc].pop(0)
                    self._deficit[tc] -= pkt.size_bytes
                    # Also remove from FIFO queue if present (policy may have switched)
                    self._fifo_queue = [
                        (s, p) for s, p in self._fifo_queue if p is not pkt
                    ]
                    return pkt
        # Fallback: serve any non-empty queue
        for tc in PRIORITY_ORDER:
            if self.queues[tc]:
                pkt = self.queues[tc].pop(0)
                self._fifo_queue = [
                    (s, p) for s, p in self._fifo_queue if p is not pkt
                ]
                return pkt
        return None

    def transmission_time(self, pkt: SimPacket) -> float:
        """Time to serialize a packet on the wire."""
        return (pkt.size_bytes * 8) / self.capacity_bps

    def set_policy(self, policy: PolicyMode) -> None:
        """Switch scheduling policy. Queue contents are preserved."""
        old = self.policy
        self.policy = policy
        # Rebuild FIFO list if switching to FIFO
        if policy == PolicyMode.FIFO and old != PolicyMode.FIFO:
            flat: List[Tuple[float, int, SimPacket]] = []
            seq = 0
            for tc in PRIORITY_ORDER:
                for p in self.queues[tc]:
                    flat.append((p.enqueue_time, seq, p))
                    seq += 1
            flat.sort()
            self._fifo_queue = [(s, p) for _, s, p in flat]
            self._fifo_seq = seq
        # Reset deficit counters on switch
        self._deficit = {tc: 0.0 for tc in PRIORITY_ORDER}

    def reset(self) -> None:
        """Clear all queues and state."""
        for tc in PRIORITY_ORDER:
            self.queues[tc].clear()
        self._fifo_queue.clear()
        self._fifo_seq = 0
        self.total_queued = 0
        self.busy_until = 0.0
        self._deficit = {tc: 0.0 for tc in PRIORITY_ORDER}
        self.meter = {tc: 1.0 for tc in PRIORITY_ORDER}


# ---------------------------------------------------------------------------
# Traffic source generators
# ---------------------------------------------------------------------------
class TrafficSource:
    """Generates SimPackets for one traffic class over a time window."""

    def __init__(self, tc: TrafficClass, flow_id: int) -> None:
        self.tc = tc
        self.flow_id = flow_id
        self.cfg = TRAFFIC_CLASS_CONFIG[tc]
        self.rate_mbps: float = self.cfg["default_rate_mbps"]
        self.pkt_size: int = self.cfg["default_packet_size"]
        self.seq: int = 0
        self.enabled: bool = True

    def set_rate(self, mbps: float) -> None:
        """Change the offered rate in Mbps."""
        self.rate_mbps = max(0.0, mbps)

    def generate_second(self, t_start: float) -> List[SimPacket]:
        """Generate all packets for one second starting at t_start."""
        if not self.enabled or self.rate_mbps <= 0:
            return []

        pkts: List[SimPacket] = []

        if self.tc == TrafficClass.VOIP:
            pkts = self._gen_voip(t_start)
        elif self.tc == TrafficClass.VIDEO:
            pkts = self._gen_video(t_start)
        elif self.tc == TrafficClass.WEB:
            pkts = self._gen_web(t_start)
        elif self.tc == TrafficClass.BULK:
            pkts = self._gen_bulk(t_start)

        return pkts

    # -- VoIP: constant bit rate, fixed-size packets --
    def _gen_voip(self, t0: float) -> List[SimPacket]:
        pps = max(1, int(self.rate_mbps * 1e6 / (self.pkt_size * 8)))
        interval = 1.0 / pps
        pkts: List[SimPacket] = []
        for i in range(pps):
            self.seq += 1
            pkts.append(SimPacket(
                send_time=t0 + i * interval,
                size_bytes=self.pkt_size,
                traffic_class=self.tc,
                seq_num=self.seq,
                flow_id=self.flow_id,
            ))
        return pkts

    # -- Video: CBR with I-frame bursts every 2 seconds --
    def _gen_video(self, t0: float) -> List[SimPacket]:
        pps = max(1, int(self.rate_mbps * 1e6 / (self.pkt_size * 8)))
        interval = 1.0 / pps
        pkts: List[SimPacket] = []
        # Determine if we need an I-frame burst this second
        second_idx = int(t0)
        burst_in_this_second = (second_idx % 2 == 0)
        burst_start = 0.0   # relative offset within the second
        burst_duration = 0.05  # 50 ms
        burst_multiplier = 3

        for i in range(pps):
            t = t0 + i * interval
            rel = t - t0
            self.seq += 1
            pkts.append(SimPacket(
                send_time=t,
                size_bytes=self.pkt_size,
                traffic_class=self.tc,
                seq_num=self.seq,
                flow_id=self.flow_id,
            ))

        # Add burst packets
        if burst_in_this_second:
            burst_pps = pps * burst_multiplier
            burst_interval = burst_duration / max(1, int(burst_pps * burst_duration))
            n_burst = int(burst_pps * burst_duration)
            for i in range(n_burst):
                self.seq += 1
                pkts.append(SimPacket(
                    send_time=t0 + burst_start + i * burst_interval,
                    size_bytes=self.pkt_size,
                    traffic_class=self.tc,
                    seq_num=self.seq,
                    flow_id=self.flow_id,
                ))
        return pkts

    # -- Web: Poisson arrivals, random packet sizes 400-1400 --
    def _gen_web(self, t0: float) -> List[SimPacket]:
        avg_size = 900
        pps = max(1, int(self.rate_mbps * 1e6 / (avg_size * 8)))
        pkts: List[SimPacket] = []
        t = t0
        while t < t0 + 1.0:
            inter = random.expovariate(pps) if pps > 0 else 1.0
            t += inter
            if t >= t0 + 1.0:
                break
            self.seq += 1
            sz = random.randint(400, 1400)
            pkts.append(SimPacket(
                send_time=t,
                size_bytes=sz,
                traffic_class=self.tc,
                seq_num=self.seq,
                flow_id=self.flow_id,
            ))
        return pkts

    # -- Bulk: constant flood at configured rate --
    def _gen_bulk(self, t0: float) -> List[SimPacket]:
        if self.rate_mbps <= 0:
            return []
        pps = max(1, int(self.rate_mbps * 1e6 / (self.pkt_size * 8)))
        interval = 1.0 / pps
        pkts: List[SimPacket] = []
        for i in range(pps):
            self.seq += 1
            pkts.append(SimPacket(
                send_time=t0 + i * interval,
                size_bytes=self.pkt_size,
                traffic_class=self.tc,
                seq_num=self.seq,
                flow_id=self.flow_id,
            ))
        return pkts


# ---------------------------------------------------------------------------
# Adaptive policy controller
# ---------------------------------------------------------------------------
class AdaptiveController:
    """
    Monitors bottleneck utilization and per-class loss every second.
    When utilization > 85% or priority-class loss > 2%, throttle Bulk
    via metering and promote affected class.
    De-escalate with 10-second hysteresis when utilization < 70%.
    """

    def __init__(self, link: BottleneckLink) -> None:
        self.link = link
        self.escalated: bool = False
        self.escalate_time: float = 0.0
        self.last_action: str = ""

    def evaluate(
        self,
        now: float,
        utilization: float,
        class_metrics: Dict[str, FlowMetrics],
    ) -> Optional[str]:
        """
        Evaluate current conditions and adjust metering.
        Returns a description string if an action was taken, else None.
        """
        action: Optional[str] = None

        # Check priority class loss (VoIP or Video)
        priority_loss = False
        for tc_name in ("voip", "video"):
            m = class_metrics.get(tc_name)
            if m and m.loss_percent > ADAPTIVE_LOSS_THRESHOLD * 100:
                priority_loss = True
                break

        if utilization > ADAPTIVE_HIGH_UTIL or priority_loss:
            if not self.escalated:
                self.escalated = True
                self.escalate_time = now
                # Throttle bulk to 30% admission
                self.link.meter[TrafficClass.BULK] = 0.30
                # Slightly throttle web
                self.link.meter[TrafficClass.WEB] = 0.80
                # Guarantee VoIP/Video
                self.link.meter[TrafficClass.VOIP] = 1.0
                self.link.meter[TrafficClass.VIDEO] = 1.0
                action = (
                    f"ESCALATE: util={utilization:.1%}, priority_loss={priority_loss}. "
                    f"Bulk metered to 30%, Web to 80%."
                )
                self.last_action = action
            elif self.escalated:
                # Already escalated, tighten further if still bad
                current_bulk = self.link.meter[TrafficClass.BULK]
                if utilization > 0.92 and current_bulk > 0.10:
                    self.link.meter[TrafficClass.BULK] = max(0.10, current_bulk - 0.10)
                    action = f"TIGHTEN: Bulk metered to {self.link.meter[TrafficClass.BULK]:.0%}"
                    self.last_action = action

        elif self.escalated and utilization < ADAPTIVE_LOW_UTIL:
            elapsed = now - self.escalate_time
            if elapsed >= ADAPTIVE_HYSTERESIS_S:
                # De-escalate
                self.escalated = False
                for tc in PRIORITY_ORDER:
                    self.link.meter[tc] = 1.0
                action = (
                    f"DE-ESCALATE: util={utilization:.1%}, "
                    f"hysteresis {elapsed:.1f}s elapsed. All meters restored."
                )
                self.last_action = action

        return action

    def reset(self) -> None:
        """Reset controller state."""
        self.escalated = False
        self.escalate_time = 0.0
        self.last_action = ""


# ---------------------------------------------------------------------------
# Main simulation engine
# ---------------------------------------------------------------------------
class SimulationEngine:
    """
    Discrete-event simulation of the QoS bottleneck topology.

    Thread-safe: can be started, stopped, and reconfigured from any thread.
    Pushes per-second FlowMetrics to a callback.
    """

    def __init__(self, metrics_callback: Optional[Callable] = None) -> None:
        self._lock = threading.Lock()
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self.running: bool = False
        self.run_id: str = ""

        self._metrics_cb = metrics_callback

        # Topology components
        self.link = BottleneckLink()
        self.adaptive = AdaptiveController(self.link)

        # Traffic sources (flow_id matches class index)
        self.sources: Dict[TrafficClass, TrafficSource] = {
            tc: TrafficSource(tc, CLASS_INDEX[tc]) for tc in PRIORITY_ORDER
        }

        # Policy
        self._policy = PolicyMode.FIFO
        self._weights = dict(DEFAULT_WEIGHTS)
        self._caps = dict(DEFAULT_CAPS)
        self._policy_log: List[PolicyChange] = []

        # Metrics state
        self._elapsed: int = 0
        self._buckets: Dict[TrafficClass, _SecondBucket] = {}
        self._historical_metrics: List[Dict[str, FlowMetrics]] = []
        self._demand: Dict[str, float] = {}  # last known demand per class

    # ---- public API ----
    @property
    def state(self) -> SystemState:
        return self.get_state()

    @property
    def policy(self) -> str:
        return self._policy.value

    @property
    def policy_log(self) -> List[dict]:
        with self._lock:
            return [pc.to_dict() for pc in self._policy_log]

    def set_metrics_callback(self, cb: Optional[Callable]) -> None:
        """Set or update the per-second metrics callback."""
        self._metrics_cb = cb

    def set_weights(self, weights: Dict[str, float]) -> None:
        """Convenience method to update class weights."""
        self.set_policy(self._policy.value, weights=weights)

    def start(self, duration: int = 60) -> str:
        """Start the simulation in a background thread. Returns run_id."""
        with self._lock:
            if self.running:
                return self.run_id
            self.run_id = f"sim_{int(time.time())}_{random.randint(1000, 9999)}"
            self.running = True
            self._stop_event.clear()
            self._elapsed = 0
            self._policy_log.clear()
            self._historical_metrics.clear()
            self.link.reset()
            self.adaptive.reset()
            for src in self.sources.values():
                src.seq = 0
            self._reset_buckets()

        self._thread = threading.Thread(
            target=self._run_loop,
            args=(duration,),
            daemon=True,
            name=f"sim-{self.run_id}",
        )
        self._thread.start()
        return self.run_id

    def stop(self) -> None:
        """Stop the simulation."""
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5.0)
        with self._lock:
            self.running = False

    def configure(
        self,
        run_id: Optional[str] = None,
        mode: str = "simulation",
        policy: str = "fifo",
        duration: int = 60,
        bottleneck_mbps: float = 10.0,
    ) -> None:
        """Configure simulation parameters."""
        with self._lock:
            if run_id:
                self.run_id = run_id
            self.link.bandwidth_bps = bottleneck_mbps * 1e6
        self.set_policy(policy)

    def set_traffic_params(
        self,
        traffic_class: str,
        rate_mbps: Optional[float] = None,
        packet_size: Optional[int] = None,
        enabled: Optional[bool] = None,
    ) -> None:
        """Adjust traffic generator parameters for a specific class."""
        tc = TrafficClass(traffic_class)
        src = self.sources.get(tc)
        if src:
            if rate_mbps is not None:
                src.set_rate(rate_mbps)
            if packet_size is not None:
                src.pkt_size = packet_size
            if enabled is not None:
                src.enabled = enabled

    def set_policy(
        self,
        policy_str: Optional[str] = None,
        weights: Optional[Dict[str, float]] = None,
        caps: Optional[Dict[str, float]] = None,
        reason: str = "user",
        mode: Optional[str] = None,
    ) -> None:
        """Change the scheduling policy at runtime."""
        target = mode or policy_str or "fifo"
        new_policy = PolicyMode(target)
        with self._lock:
            old_policy = self._policy
            old_w = dict(self._weights)
            old_c = dict(self._caps)
            self._policy = new_policy
            if weights:
                self._weights.update(weights)
            if caps:
                self._caps.update(caps)
            self.link.weights = dict(self._weights)
            self.link.caps = dict(self._caps)
            self.link.set_policy(new_policy)
            if new_policy != PolicyMode.ADAPTIVE:
                self.adaptive.reset()
                for tc in PRIORITY_ORDER:
                    self.link.meter[tc] = 1.0
            self._policy_log.append(PolicyChange(
                timestamp=time.time(),
                old_policy=old_policy.value,
                new_policy=new_policy.value,
                reason=reason,
                weights_before=old_w,
                weights_after=dict(self._weights),
                caps_before=old_c,
                caps_after=dict(self._caps),
            ))

    def set_bulk_rate(self, mbps: float) -> None:
        """Adjust the Bulk traffic generator rate."""
        self.sources[TrafficClass.BULK].set_rate(mbps)

    def set_class_rate(self, tc: TrafficClass, mbps: float) -> None:
        """Adjust the rate for any traffic class."""
        self.sources[tc].set_rate(mbps)

    def get_state(self) -> SystemState:
        """Return a snapshot of current system state."""
        with self._lock:
            metrics_dict: Dict[str, dict] = {}
            if self._historical_metrics:
                last = self._historical_metrics[-1]
                for tc_name, fm in last.items():
                    metrics_dict[tc_name] = fm.to_dict()

            util = self._compute_utilization()
            jfi_raw, jfi_norm = self._compute_fairness(metrics_dict)

            adaptive_state = {}
            if self._policy == PolicyMode.ADAPTIVE:
                adaptive_state = {
                    "escalated": self.adaptive.escalated,
                    "last_action": self.adaptive.last_action,
                    "meters": {tc.value: self.link.meter[tc] for tc in PRIORITY_ORDER},
                }

            return SystemState(
                mode="simulation",
                policy=self._policy.value,
                running=self.running,
                run_id=self.run_id,
                elapsed_seconds=self._elapsed,
                bottleneck_utilization=round(util, 4),
                jain_fairness_index=round(jfi_raw, 4),
                jain_demand_normalized=round(jfi_norm, 4),
                metrics=metrics_dict,
                policy_weights=dict(self._weights),
                policy_caps=dict(self._caps),
                policy_log=[pc.to_dict() for pc in self._policy_log],
                adaptive_state=adaptive_state,
            )

    def get_history(self) -> List[Dict[str, dict]]:
        """Return all historical per-second metrics."""
        with self._lock:
            return [
                {k: v.to_dict() for k, v in snap.items()}
                for snap in self._historical_metrics
            ]

    # ---- internals ----
    def _reset_buckets(self) -> None:
        self._buckets = {tc: _SecondBucket() for tc in PRIORITY_ORDER}

    def _run_loop(self, duration: int) -> None:
        """Main simulation loop – discrete event simulation."""
        try:
            self._simulate(duration)
        finally:
            with self._lock:
                self.running = False

    def _simulate(self, duration: int) -> None:
        """Run the discrete-event simulation for `duration` seconds."""
        event_heap: List[SimEvent] = []
        tie_counter: int = 0

        # Schedule tick events for each second
        for sec in range(1, duration + 1):
            tie_counter += 1
            heapq.heappush(event_heap, SimEvent(
                time=float(sec), etype=EVENT_TICK, tie=tie_counter,
            ))

        # Schedule stop event
        tie_counter += 1
        heapq.heappush(event_heap, SimEvent(
            time=float(duration) + 0.001, etype=EVENT_STOP, tie=tie_counter,
        ))

        # Generate first second of traffic
        self._schedule_traffic(event_heap, 0.0, tie_counter)
        current_second: int = 0

        while event_heap and not self._stop_event.is_set():
            ev = heapq.heappop(event_heap)

            if ev.etype == EVENT_STOP:
                break

            if ev.etype == EVENT_TICK:
                # Collect metrics for the completed second
                current_second += 1
                self._collect_metrics(ev.time, current_second)

                # Generate traffic for the next second
                if current_second < duration:
                    tie_counter = self._schedule_traffic(
                        event_heap, float(current_second), tie_counter
                    )

                # Adaptive check
                if self._policy == PolicyMode.ADAPTIVE:
                    self._run_adaptive(ev.time)

                continue

            if ev.etype == EVENT_PKT_ARRIVAL:
                pkt = ev.packet
                if pkt is None:
                    continue
                self._handle_arrival(pkt, ev.time, event_heap, tie_counter)
                # tie_counter may increment inside; we track via closure
                continue

            if ev.etype == EVENT_LINK_FREE:
                self._try_transmit(ev.time, event_heap, tie_counter)
                continue

    def _schedule_traffic(
        self, heap: List[SimEvent], t_start: float, tie: int
    ) -> int:
        """Generate packets for one second and push arrival events."""
        for tc in PRIORITY_ORDER:
            src = self.sources[tc]
            pkts = src.generate_second(t_start)
            with self._lock:
                self._demand[tc.value] = src.rate_mbps
            for pkt in pkts:
                self._buckets[tc].record_sent()
                tie += 1
                heapq.heappush(heap, SimEvent(
                    time=pkt.send_time, etype=EVENT_PKT_ARRIVAL, tie=tie, packet=pkt,
                ))
        return tie

    def _handle_arrival(
        self,
        pkt: SimPacket,
        now: float,
        heap: List[SimEvent],
        tie: int,
    ) -> None:
        """Handle a packet arriving at the bottleneck."""
        accepted = self.link.enqueue(pkt, now)
        if not accepted:
            pkt.dropped = True
            self._buckets[pkt.traffic_class].record_drop()
            return

        # If link is idle, start transmitting immediately
        if now >= self.link.busy_until:
            self._try_transmit(now, heap, tie)

    def _try_transmit(
        self, now: float, heap: List[SimEvent], tie: int
    ) -> None:
        """Dequeue and transmit the next packet if the link is free."""
        if now < self.link.busy_until:
            return

        pkt = self.link.dequeue()
        if pkt is None:
            return

        tx_time = self.link.transmission_time(pkt)
        pkt.dequeue_time = now
        pkt.receive_time = now + tx_time + self.link.prop_delay
        self.link.busy_until = now + tx_time

        # Record reception
        self._buckets[pkt.traffic_class].record_receive(pkt)

        # Schedule link-free event so next packet can transmit
        tie += 1
        heapq.heappush(heap, SimEvent(
            time=self.link.busy_until, etype=EVENT_LINK_FREE, tie=tie,
        ))

    def _collect_metrics(self, now: float, second: int) -> None:
        """Snapshot metrics for the completed second, push to callback."""
        wall_ts = time.time()
        snapshot: Dict[str, FlowMetrics] = {}

        for tc in PRIORITY_ORDER:
            fm = self._buckets[tc].to_metrics(wall_ts, tc.value)
            snapshot[tc.value] = fm

        with self._lock:
            self._elapsed = second
            self._historical_metrics.append(snapshot)

        # Push via callback
        if self._metrics_cb:
            try:
                state = self.get_state()
                self._metrics_cb(state)
            except Exception:
                pass  # don't crash the sim on callback error

        # Reset buckets for next second
        # Carry forward jitter accumulators
        old_jitters = {tc: self._buckets[tc].jitter_acc for tc in PRIORITY_ORDER}
        old_arrivals = {tc: self._buckets[tc].prev_arrival for tc in PRIORITY_ORDER}
        self._reset_buckets()
        for tc in PRIORITY_ORDER:
            self._buckets[tc].jitter_acc = old_jitters[tc]
            self._buckets[tc].prev_arrival = old_arrivals[tc]
            self._buckets[tc]._jitter_initialized = old_jitters[tc] > 0

    def _run_adaptive(self, now: float) -> None:
        """Run adaptive controller evaluation."""
        with self._lock:
            if not self._historical_metrics:
                return
            last = self._historical_metrics[-1]
            util = self._compute_utilization()

        action = self.adaptive.evaluate(now, util, last)
        if action:
            with self._lock:
                self._policy_log.append(PolicyChange(
                    timestamp=time.time(),
                    old_policy="adaptive",
                    new_policy="adaptive",
                    reason=action,
                    weights_before=dict(self._weights),
                    weights_after=dict(self._weights),
                    caps_before=dict(self._caps),
                    caps_after=dict(self._caps),
                ))

    def _compute_utilization(self) -> float:
        """Compute bottleneck utilization as total throughput / capacity."""
        if not self._historical_metrics:
            return 0.0
        last = self._historical_metrics[-1]
        total_mbps = sum(fm.throughput_mbps for fm in last.values())
        cap_mbps = self.link.capacity_bps / 1e6
        return min(total_mbps / cap_mbps, 1.0) if cap_mbps > 0 else 0.0

    def _compute_fairness(
        self, metrics_dict: Dict[str, dict]
    ) -> Tuple[float, float]:
        """
        Compute Jain's Fairness Index.
        Raw: J(throughput_1 .. throughput_n)
        Demand-normalized: J(throughput_i / demand_i)  where demand_i > 0
        """
        throughputs: List[float] = []
        normalized: List[float] = []

        for tc in PRIORITY_ORDER:
            m = metrics_dict.get(tc.value, {})
            tp = m.get("throughput_mbps", 0.0) if isinstance(m, dict) else 0.0
            throughputs.append(tp)
            demand = self._demand.get(tc.value, 1.0)
            if demand > 0:
                normalized.append(tp / demand)
            else:
                normalized.append(1.0)  # no demand → fully satisfied

        jfi_raw = self._jain(throughputs)
        jfi_norm = self._jain(normalized)
        return jfi_raw, jfi_norm

    @staticmethod
    def _jain(values: List[float]) -> float:
        """Jain's Fairness Index: (sum(x))^2 / (n * sum(x^2))."""
        n = len(values)
        if n == 0:
            return 1.0
        s = sum(values)
        ss = sum(x * x for x in values)
        if ss == 0:
            return 1.0
        return (s * s) / (n * ss)
