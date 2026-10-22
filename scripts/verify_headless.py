"""
Headless verification script for the QoS Traffic Management System.

Runs the simulation under FIFO and Priority policies with congestion,
then prints a comparison table showing how Priority cuts VoIP loss/latency.

Usage:
    python scripts/verify_headless.py
"""
import sys
import os
import time
import json

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from traffic.simulator import SimulationEngine
from traffic.models import TrafficClass, PolicyMode

DURATION = 10  # seconds per test
BULK_RATE = 14.0  # Mbps — over-subscribes 10 Mbps bottleneck


def collect_run(policy: str, label: str) -> dict:
    """Run a simulation with given policy and return averaged metrics."""
    print(f"\n{'─'*60}")
    print(f"  Running: {label} ({policy.upper()}) — {DURATION}s @ bulk={BULK_RATE} Mbps")
    print(f"{'─'*60}")

    engine = SimulationEngine()
    snapshots = []

    def on_metrics(state_dict):
        snapshots.append(state_dict)

    engine.set_metrics_callback(on_metrics)
    engine.set_policy(policy)
    engine.set_bulk_rate(BULK_RATE)
    engine.start(duration=DURATION)

    # Wait for completion
    while engine.running:
        time.sleep(0.5)
    engine.stop()

    # Skip first 2 seconds (warm-up)
    valid = snapshots[2:] if len(snapshots) > 2 else snapshots

    if not valid:
        print("  ⚠ No data collected!")
        return {}

    # Average metrics per class
    classes = ["voip", "video", "web", "bulk"]
    result = {}

    for cls in classes:
        tp_list = []
        lat_list = []
        loss_list = []
        jitter_list = []

        for snap in valid:
            if isinstance(snap, dict):
                m = snap.get("metrics", {}).get(cls, {})
            else:
                m = getattr(snap, 'metrics', {}).get(cls, {})
                if hasattr(m, 'to_dict'):
                    m = m.to_dict()
                elif not isinstance(m, dict):
                    m = {}

            tp_list.append(m.get("throughput_mbps", 0))
            lat_list.append(m.get("latency_avg_ms", 0))
            loss_list.append(m.get("loss_percent", 0))
            jitter_list.append(m.get("jitter_ms", 0))

        n = max(len(tp_list), 1)
        result[cls] = {
            "throughput_mbps": sum(tp_list) / n,
            "latency_avg_ms": sum(lat_list) / n,
            "loss_percent": sum(loss_list) / n,
            "jitter_ms": sum(jitter_list) / n,
        }

    # Fairness
    jain_list = []
    util_list = []
    for snap in valid:
        if isinstance(snap, dict):
            jain_list.append(snap.get("jain_fairness_index", 0))
            util_list.append(snap.get("bottleneck_utilization", 0))
        else:
            jain_list.append(getattr(snap, 'jain_fairness_index', 0))
            util_list.append(getattr(snap, 'bottleneck_utilization', 0))

    n = max(len(jain_list), 1)
    result["_jain"] = sum(jain_list) / n
    result["_util"] = sum(util_list) / n

    return result


def print_comparison(fifo: dict, priority: dict, weighted: dict, adaptive: dict):
    """Print a formatted comparison table."""
    print("\n")
    print("=" * 90)
    print("  QoS TRAFFIC MANAGEMENT — HEADLESS VERIFICATION RESULTS")
    print("=" * 90)

    classes = ["voip", "video", "web", "bulk"]
    labels = {
        "voip": "VoIP (EF)",
        "video": "Video (AF41)",
        "web": "Web (AF21)",
        "bulk": "Bulk (BE)",
    }

    # ─── Throughput Table ───
    print(f"\n{'─'*90}")
    print(f"  {'THROUGHPUT (Mbps)':>20}  {'FIFO':>10}  {'Priority':>10}  {'Weighted':>10}  {'Adaptive':>10}")
    print(f"{'─'*90}")
    for cls in classes:
        f = fifo.get(cls, {}).get("throughput_mbps", 0)
        p = priority.get(cls, {}).get("throughput_mbps", 0)
        w = weighted.get(cls, {}).get("throughput_mbps", 0)
        a = adaptive.get(cls, {}).get("throughput_mbps", 0)
        print(f"  {labels[cls]:>20}  {f:>10.3f}  {p:>10.3f}  {w:>10.3f}  {a:>10.3f}")

    # ─── Latency Table ───
    print(f"\n{'─'*90}")
    print(f"  {'LATENCY avg (ms)':>20}  {'FIFO':>10}  {'Priority':>10}  {'Weighted':>10}  {'Adaptive':>10}")
    print(f"{'─'*90}")
    for cls in classes:
        f = fifo.get(cls, {}).get("latency_avg_ms", 0)
        p = priority.get(cls, {}).get("latency_avg_ms", 0)
        w = weighted.get(cls, {}).get("latency_avg_ms", 0)
        a = adaptive.get(cls, {}).get("latency_avg_ms", 0)
        print(f"  {labels[cls]:>20}  {f:>10.2f}  {p:>10.2f}  {w:>10.2f}  {a:>10.2f}")

    # ─── Loss Table ───
    print(f"\n{'─'*90}")
    print(f"  {'LOSS (%)':>20}  {'FIFO':>10}  {'Priority':>10}  {'Weighted':>10}  {'Adaptive':>10}")
    print(f"{'─'*90}")
    for cls in classes:
        f = fifo.get(cls, {}).get("loss_percent", 0)
        p = priority.get(cls, {}).get("loss_percent", 0)
        w = weighted.get(cls, {}).get("loss_percent", 0)
        a = adaptive.get(cls, {}).get("loss_percent", 0)
        print(f"  {labels[cls]:>20}  {f:>10.2f}  {p:>10.2f}  {w:>10.2f}  {a:>10.2f}")

    # ─── Jitter Table ───
    print(f"\n{'─'*90}")
    print(f"  {'JITTER (ms)':>20}  {'FIFO':>10}  {'Priority':>10}  {'Weighted':>10}  {'Adaptive':>10}")
    print(f"{'─'*90}")
    for cls in classes:
        f = fifo.get(cls, {}).get("jitter_ms", 0)
        p = priority.get(cls, {}).get("jitter_ms", 0)
        w = weighted.get(cls, {}).get("jitter_ms", 0)
        a = adaptive.get(cls, {}).get("jitter_ms", 0)
        print(f"  {labels[cls]:>20}  {f:>10.3f}  {p:>10.3f}  {w:>10.3f}  {a:>10.3f}")

    # ─── Fairness & Utilisation ───
    print(f"\n{'─'*90}")
    print(f"  {'SUMMARY':>20}  {'FIFO':>10}  {'Priority':>10}  {'Weighted':>10}  {'Adaptive':>10}")
    print(f"{'─'*90}")
    print(f"  {'Jain Index':>20}  {fifo.get('_jain',0):>10.4f}  {priority.get('_jain',0):>10.4f}  {weighted.get('_jain',0):>10.4f}  {adaptive.get('_jain',0):>10.4f}")
    print(f"  {'Utilisation':>20}  {fifo.get('_util',0):>10.2%}  {priority.get('_util',0):>10.2%}  {weighted.get('_util',0):>10.2%}  {adaptive.get('_util',0):>10.2%}")

    # ─── Key Findings ───
    print(f"\n{'='*90}")
    print("  KEY FINDINGS")
    print(f"{'='*90}")

    fifo_voip_loss = fifo.get("voip", {}).get("loss_percent", 0)
    prio_voip_loss = priority.get("voip", {}).get("loss_percent", 0)
    fifo_voip_lat = fifo.get("voip", {}).get("latency_avg_ms", 0)
    prio_voip_lat = priority.get("voip", {}).get("latency_avg_ms", 0)

    if fifo_voip_loss > 0:
        loss_reduction = ((fifo_voip_loss - prio_voip_loss) / fifo_voip_loss) * 100
        print(f"  • Priority reduces VoIP loss by {loss_reduction:.1f}%  ({fifo_voip_loss:.2f}% → {prio_voip_loss:.2f}%)")
    else:
        print(f"  • VoIP loss: FIFO={fifo_voip_loss:.2f}%, Priority={prio_voip_loss:.2f}%")

    if fifo_voip_lat > 0:
        lat_reduction = ((fifo_voip_lat - prio_voip_lat) / fifo_voip_lat) * 100
        print(f"  • Priority reduces VoIP latency by {lat_reduction:.1f}%  ({fifo_voip_lat:.1f}ms → {prio_voip_lat:.1f}ms)")
    else:
        print(f"  • VoIP latency: FIFO={fifo_voip_lat:.1f}ms, Priority={prio_voip_lat:.1f}ms")

    fifo_bulk_tp = fifo.get("bulk", {}).get("throughput_mbps", 0)
    prio_bulk_tp = priority.get("bulk", {}).get("throughput_mbps", 0)
    print(f"  • Bulk throughput: FIFO={fifo_bulk_tp:.2f} Mbps, Priority={prio_bulk_tp:.2f} Mbps (trades bulk for VoIP protection)")

    print(f"\n  ✅ Verification complete.\n")


def main():
    print("\n" + "═" * 60)
    print("  QoS TRAFFIC MANAGEMENT SYSTEM — HEADLESS VERIFICATION")
    print("  Bottleneck: 10 Mbps / 20 ms / 100-pkt queue")
    print(f"  Bulk flood: {BULK_RATE} Mbps (oversubscription)")
    print("═" * 60)

    fifo = collect_run("fifo", "FIFO Baseline")
    priority = collect_run("priority", "Strict Priority")
    weighted = collect_run("weighted", "Weighted Fair (40/30/20/10)")
    adaptive = collect_run("adaptive", "Adaptive QoS")

    print_comparison(fifo, priority, weighted, adaptive)


if __name__ == "__main__":
    main()
