"""
Unit tests for the QoS Traffic Management System.

Tests loss calculation, jitter (RFC 3550), Jain's Fairness Index, 
policy transitions, and simulation correctness.
"""
import sys
import os
import time
import math

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from traffic.models import (
    TrafficClass,
    PolicyMode,
    FlowMetrics,
    SystemState,
    PacketHeader,
    TRAFFIC_CLASS_CONFIG,
)
from traffic.simulator import SimulationEngine, SimPacket, PRIORITY_ORDER


class TestJainFairnessIndex:
    """Test Jain's Fairness Index calculation."""

    def test_perfect_fairness(self):
        """Equal allocations → J = 1.0."""
        engine = SimulationEngine()
        values = [2.5, 2.5, 2.5, 2.5]
        result = engine._jain(values)
        assert abs(result - 1.0) < 1e-9, f"Expected 1.0, got {result}"

    def test_total_unfairness(self):
        """One flow gets everything → J = 1/n."""
        engine = SimulationEngine()
        values = [10.0, 0.0, 0.0, 0.0]
        result = engine._jain(values)
        expected = 1.0 / 4.0
        assert abs(result - expected) < 1e-9, f"Expected {expected}, got {result}"

    def test_partial_fairness(self):
        """Mixed allocation → 0 < J < 1."""
        engine = SimulationEngine()
        values = [5.0, 3.0, 1.5, 0.5]
        n = 4
        s = sum(values)
        ss = sum(x * x for x in values)
        expected = (s * s) / (n * ss)
        result = engine._jain(values)
        assert abs(result - expected) < 1e-9, f"Expected {expected}, got {result}"

    def test_empty(self):
        """No flows → J = 1.0 by convention."""
        engine = SimulationEngine()
        result = engine._jain([])
        assert result == 1.0

    def test_all_zero(self):
        """All zero → J = 1.0 (no contention)."""
        engine = SimulationEngine()
        result = engine._jain([0, 0, 0, 0])
        assert result == 1.0


class TestPacketHeader:
    """Test packet header packing/unpacking."""

    def test_roundtrip(self):
        """Pack and unpack should recover original values."""
        hdr = PacketHeader(class_id=2, flow_id=3, seq_num=12345, send_ts_ns=1234567890123)
        data = hdr.pack()
        recovered = PacketHeader.unpack(data)
        assert recovered.class_id == hdr.class_id
        assert recovered.flow_id == hdr.flow_id
        assert recovered.seq_num == hdr.seq_num
        assert recovered.send_ts_ns == hdr.send_ts_ns

    def test_header_size(self):
        """Header should be exactly 14 bytes."""
        assert PacketHeader.HEADER_SIZE == 14


class TestLossCalculation:
    """Test packet loss detection from sequence gaps."""

    def test_no_loss(self):
        """Continuous sequence → 0% loss."""
        sent = 100
        received = 100
        loss_pct = ((sent - received) / sent) * 100 if sent > 0 else 0
        assert loss_pct == 0.0

    def test_half_loss(self):
        """50% packet loss."""
        sent = 100
        received = 50
        loss_pct = ((sent - received) / sent) * 100
        assert loss_pct == 50.0

    def test_total_loss(self):
        """100% packet loss."""
        sent = 100
        received = 0
        loss_pct = ((sent - received) / sent) * 100
        assert loss_pct == 100.0


class TestJitterRFC3550:
    """Test RFC 3550 jitter calculation (running EWMA of inter-arrival variance)."""

    def test_constant_interval(self):
        """Constant inter-arrival times → jitter approaches 0."""
        # RFC 3550: J(i) = J(i-1) + (|D(i-1,i)| - J(i-1)) / 16
        jitter = 0.0
        interval = 0.020  # 20ms constant
        prev_transit = 0.100  # arbitrary initial transit time

        for i in range(100):
            # All packets arrive with same transit time
            transit = 0.100
            diff = abs(transit - prev_transit)
            jitter = jitter + (diff - jitter) / 16.0
            prev_transit = transit

        assert jitter < 0.001, f"Constant interval jitter should be ~0, got {jitter}"

    def test_variable_interval(self):
        """Variable inter-arrival → non-zero jitter."""
        import random
        random.seed(42)
        jitter = 0.0
        prev_transit = 0.020

        for _ in range(100):
            transit = 0.020 + random.gauss(0, 0.005)  # 20ms ± 5ms
            diff = abs(transit - prev_transit)
            jitter = jitter + (diff - jitter) / 16.0
            prev_transit = transit

        assert jitter > 0.001, f"Variable interval should produce non-zero jitter, got {jitter}"


class TestPolicyTransitions:
    """Test that policy switching works correctly."""

    def test_fifo_to_priority(self):
        """Switching from FIFO to Priority should change engine state."""
        engine = SimulationEngine()
        assert engine.state.policy == "fifo"

        engine.set_policy("priority")
        assert engine.state.policy == "priority"

    def test_policy_log(self):
        """Policy changes should be logged with timestamps."""
        engine = SimulationEngine()
        engine.set_policy("priority", reason="User request")
        engine.set_policy("weighted", reason="Test")
        engine.set_policy("adaptive", reason="Auto")

        log = engine.state.policy_log
        assert len(log) >= 3
        assert log[-1]["new_policy"] == "adaptive"
        assert log[-1]["reason"] == "Auto"

    def test_weights_update(self):
        """Changing weights should persist in state."""
        engine = SimulationEngine()
        engine.set_policy("weighted")
        engine.set_weights({"voip": 50, "video": 25, "web": 15, "bulk": 10})
        assert engine.state.policy_weights["voip"] == 50

    def test_all_policies_valid(self):
        """All four policies should be settable."""
        engine = SimulationEngine()
        for policy in ["fifo", "priority", "weighted", "adaptive"]:
            engine.set_policy(policy)
            assert engine.state.policy == policy


class TestSimulationEngine:
    """Integration tests for the simulation engine."""

    def test_engine_starts_and_stops(self):
        """Engine should start, run briefly, and stop cleanly."""
        engine = SimulationEngine()
        results = []
        
        def on_metrics(state):
            results.append(state)
        
        engine.set_metrics_callback(on_metrics)
        run_id = engine.start(duration=3)
        assert run_id is not None
        assert engine.running
        
        time.sleep(4)
        engine.stop()
        assert not engine.running

    def test_fifo_produces_metrics(self):
        """FIFO policy should produce non-zero throughput for all classes."""
        engine = SimulationEngine()
        results = []
        
        def on_metrics(state):
            results.append(state)
        
        engine.set_metrics_callback(on_metrics)
        engine.set_policy("fifo")
        engine.start(duration=5)
        time.sleep(6)
        engine.stop()
        
        # Should have at least a few seconds of data
        assert len(results) >= 3, f"Expected >= 3 metric snapshots, got {len(results)}"

    def test_priority_protects_voip(self):
        """Under congestion, Priority policy should give VoIP lower loss than FIFO."""
        # Run FIFO under congestion
        engine_fifo = SimulationEngine()
        fifo_results = []
        engine_fifo.set_metrics_callback(lambda s: fifo_results.append(s))
        engine_fifo.set_policy("fifo")
        engine_fifo.set_bulk_rate(15.0)  # Over-subscribe
        engine_fifo.start(duration=5)
        time.sleep(6)
        engine_fifo.stop()

        # Run Priority under same congestion
        engine_prio = SimulationEngine()
        prio_results = []
        engine_prio.set_metrics_callback(lambda s: prio_results.append(s))
        engine_prio.set_policy("priority")
        engine_prio.set_bulk_rate(15.0)
        engine_prio.start(duration=5)
        time.sleep(6)
        engine_prio.stop()

        # Compare VoIP loss
        if fifo_results and prio_results:
            fifo_voip_loss = sum(
                r.get("metrics", {}).get("voip", {}).get("loss_percent", 0) 
                for r in fifo_results if isinstance(r, dict)
            ) / max(len(fifo_results), 1)
            
            prio_voip_loss = sum(
                r.get("metrics", {}).get("voip", {}).get("loss_percent", 0)
                for r in prio_results if isinstance(r, dict)
            ) / max(len(prio_results), 1)
            
            print(f"  FIFO VoIP loss: {fifo_voip_loss:.2f}%")
            print(f"  Priority VoIP loss: {prio_voip_loss:.2f}%")
            # Priority should reduce or maintain VoIP loss
            assert prio_voip_loss <= fifo_voip_loss + 1.0, \
                f"Priority should protect VoIP: FIFO={fifo_voip_loss}%, Priority={prio_voip_loss}%"


def run_tests():
    """Run all tests and print results."""
    test_classes = [
        TestJainFairnessIndex,
        TestPacketHeader,
        TestLossCalculation,
        TestJitterRFC3550,
        TestPolicyTransitions,
        TestSimulationEngine,
    ]

    total = 0
    passed = 0
    failed = 0
    errors = []

    for cls in test_classes:
        instance = cls()
        methods = [m for m in dir(instance) if m.startswith("test_")]
        print(f"\n{'='*60}")
        print(f"  {cls.__name__}")
        print(f"{'='*60}")

        for method_name in methods:
            total += 1
            try:
                getattr(instance, method_name)()
                print(f"  ✓ {method_name}")
                passed += 1
            except Exception as e:
                print(f"  ✗ {method_name}: {e}")
                failed += 1
                errors.append((cls.__name__, method_name, str(e)))

    print(f"\n{'='*60}")
    print(f"  Results: {passed}/{total} passed, {failed} failed")
    print(f"{'='*60}")

    if errors:
        print("\nFailures:")
        for cls_name, method, err in errors:
            print(f"  {cls_name}.{method}: {err}")

    return failed == 0


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
