"""Shared data models for the QoS Traffic Management System."""
from dataclasses import dataclass, field, asdict
from enum import IntEnum, Enum
from typing import Optional, Dict, List
import time
import struct
import json


class TrafficClass(str, Enum):
    VOIP = "voip"
    VIDEO = "video"
    WEB = "web"
    BULK = "bulk"


class DSCPValue(IntEnum):
    EF = 46      # Expedited Forwarding - VoIP
    AF41 = 34    # Assured Forwarding 41 - Video
    AF21 = 18    # Assured Forwarding 21 - Web
    BE = 0       # Best Effort - Bulk


class PolicyMode(str, Enum):
    FIFO = "fifo"
    PRIORITY = "priority"
    WEIGHTED = "weighted"
    ADAPTIVE = "adaptive"


# Traffic class config
TRAFFIC_CLASS_CONFIG = {
    TrafficClass.VOIP: {
        "dscp": DSCPValue.EF,
        "port": 5001,
        "default_packet_size": 160,
        "default_rate_pps": 50,  # 50 packets per second
        "default_rate_mbps": 0.064,  # 160 * 50 * 8 / 1e6
        "priority": 0,  # highest
        "color": "#C6FF3D",
        "label": "VoIP · EF",
    },
    TrafficClass.VIDEO: {
        "dscp": DSCPValue.AF41,
        "port": 5002,
        "default_packet_size": 1200,
        "default_rate_pps": 208,  # ~2 Mbps
        "default_rate_mbps": 2.0,
        "priority": 1,
        "color": "#FF7A45",
        "label": "Video · AF41",
    },
    TrafficClass.WEB: {
        "dscp": DSCPValue.AF21,
        "port": 5003,
        "default_packet_size": 900,  # avg of 400-1400
        "default_rate_pps": 208,  # ~1.5 Mbps avg
        "default_rate_mbps": 1.5,
        "priority": 2,
        "color": "#6AA8FF",
        "label": "Web · AF21",
    },
    TrafficClass.BULK: {
        "dscp": DSCPValue.BE,
        "port": 5004,
        "default_packet_size": 1400,
        "default_rate_pps": 893,  # ~10 Mbps
        "default_rate_mbps": 10.0,
        "priority": 3,  # lowest
        "color": "#B79CFF",
        "label": "Bulk · BE",
    },
}


@dataclass
class PacketHeader:
    """UDP payload header for measurement."""
    class_id: int        # TrafficClass enum value index
    flow_id: int         # unique flow identifier
    seq_num: int         # sequence number
    send_ts_ns: int      # send timestamp in nanoseconds

    HEADER_FORMAT = "!BBIQ"  # class_id(1B), flow_id(1B), seq_num(4B), timestamp(8B)
    HEADER_SIZE = struct.calcsize(HEADER_FORMAT)

    def pack(self) -> bytes:
        """Pack header into bytes for network transmission."""
        return struct.pack(
            self.HEADER_FORMAT,
            self.class_id,
            self.flow_id,
            self.seq_num,
            self.send_ts_ns,
        )

    @classmethod
    def unpack(cls, data: bytes) -> 'PacketHeader':
        """Unpack header from received bytes."""
        class_id, flow_id, seq_num, send_ts_ns = struct.unpack(
            cls.HEADER_FORMAT, data[:cls.HEADER_SIZE]
        )
        return cls(
            class_id=class_id,
            flow_id=flow_id,
            seq_num=seq_num,
            send_ts_ns=send_ts_ns,
        )


@dataclass
class FlowMetrics:
    """Per-class, per-second metrics."""
    timestamp: float
    traffic_class: str
    throughput_mbps: float = 0.0
    latency_avg_ms: float = 0.0
    latency_p95_ms: float = 0.0
    latency_p99_ms: float = 0.0
    jitter_ms: float = 0.0
    loss_percent: float = 0.0
    packets_sent: int = 0
    packets_received: int = 0
    packets_lost: int = 0
    bytes_received: int = 0

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)


@dataclass
class SystemState:
    """Current system state for the dashboard."""
    mode: str = "simulation"  # "simulation" or "emulation"
    policy: str = "fifo"
    running: bool = False
    run_id: str = ""
    elapsed_seconds: int = 0
    bottleneck_utilization: float = 0.0
    jain_fairness_index: float = 1.0
    jain_demand_normalized: float = 1.0
    metrics: Dict[str, dict] = field(default_factory=dict)
    policy_weights: Dict[str, float] = field(
        default_factory=lambda: {"voip": 40, "video": 30, "web": 20, "bulk": 10}
    )
    policy_caps: Dict[str, float] = field(
        default_factory=lambda: {"voip": 100, "video": 100, "web": 100, "bulk": 100}
    )
    policy_log: List[dict] = field(default_factory=list)
    adaptive_state: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)


@dataclass
class PolicyChange:
    """Log entry for a policy change."""
    timestamp: float
    old_policy: str
    new_policy: str
    reason: str
    weights_before: Optional[Dict[str, float]] = None
    weights_after: Optional[Dict[str, float]] = None
    caps_before: Optional[Dict[str, float]] = None
    caps_after: Optional[Dict[str, float]] = None

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)
