"""
Ryu SDN Controller for QoS Traffic Management.

Handles OpenFlow 1.3 events, installs proactive flow entries matching on
UDP dst port and DSCP, configures OVS HTB queues on the bottleneck port,
and implements all 4 scheduling policies via queue configuration and
OpenFlow meters. Includes a REST API for runtime policy changes and polls
flow/port stats every second for adaptive mode.

NOTE: This controller requires Ryu and Open vSwitch (Linux environment).
It will not run on Windows but is fully implemented for the Mininet emulation.
"""
from __future__ import annotations

import json
import logging
import subprocess
import time
from typing import Any, Dict, List, Optional, Tuple

# Ryu imports (available only in the Mininet/Ryu environment)
from ryu.base import app_manager
from ryu.controller import dpset, ofp_event
from ryu.controller.handler import (
    CONFIG_DISPATCHER,
    MAIN_DISPATCHER,
    set_ev_cls,
)
from ryu.lib import hub
from ryu.lib.packet import ether_types, ethernet, ipv4, packet, udp
from ryu.ofproto import ofproto_v1_3
from ryu.app.wsgi import (
    ControllerBase,
    WSGIApplication,
    route,
)
from webob import Response

logger = logging.getLogger(__name__)

# --- Constants ---
BOTTLENECK_PORT = 3          # s1 port connected to s2 via the bottleneck link
LINK_RATE_KBPS = 10000       # 10 Mbps
POLL_INTERVAL = 1            # seconds

# DSCP → traffic class mapping
DSCP_MAP = {46: "voip", 34: "video", 18: "web", 0: "bulk"}
# Traffic class → UDP dst port
PORT_MAP = {"voip": 5001, "video": 5002, "web": 5003, "bulk": 5004}
# Priority order
PRIORITY_CLASSES = ["voip", "video", "web", "bulk"]

# Default weights for WFQ (percentages, must sum to 100)
DEFAULT_WEIGHTS = {"voip": 40, "video": 30, "web": 20, "bulk": 10}
DEFAULT_CAPS = {"voip": 100, "video": 100, "web": 100, "bulk": 100}

REST_API_NAME = "qos_controller_api"


class QoSController(app_manager.RyuApp):
    """Ryu application implementing QoS traffic management."""

    OFP_VERSIONS = [ofproto_v1_3.OFP_VERSION]
    _CONTEXTS = {"dpset": dpset.DPSet, "wsgi": WSGIApplication}

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.dpset: dpset.DPSet = kwargs["dpset"]
        self.wsgi: WSGIApplication = kwargs["wsgi"]

        # Register REST API
        self.wsgi.registory[REST_API_NAME] = {"controller": self}
        self.wsgi.register(QoSRestApi, {REST_API_NAME: self})

        # State
        self.datapath = None
        self.policy: str = "fifo"
        self.weights: Dict[str, float] = dict(DEFAULT_WEIGHTS)
        self.caps: Dict[str, float] = dict(DEFAULT_CAPS)
        self.policy_log: List[dict] = []

        # Adaptive state
        self._adaptive_escalated: bool = False
        self._adaptive_escalate_time: float = 0.0

        # Stats
        self._flow_stats: Dict[str, dict] = {}
        self._port_stats: Dict[int, dict] = {}
        self._prev_byte_counts: Dict[str, int] = {}

        # Monitor thread
        self._monitor_thread = None

    # ------------------------------------------------------------------
    # OpenFlow event handlers
    # ------------------------------------------------------------------
    @set_ev_cls(ofp_event.EventOFPSwitchFeatures, CONFIG_DISPATCHER)
    def switch_features_handler(self, ev: ofp_event.EventOFPSwitchFeatures) -> None:
        """Handle new switch connection: install table-miss and proactive flows."""
        dp = ev.msg.datapath
        self.datapath = dp
        ofproto = dp.ofproto
        parser = dp.ofproto_parser

        # Table-miss: send to controller
        match = parser.OFPMatch()
        actions = [parser.OFPActionOutput(ofproto.OFPP_CONTROLLER, ofproto.OFPCML_NO_BUFFER)]
        self._add_flow(dp, 0, match, actions)

        # Install proactive flows for each traffic class
        self._install_qos_flows(dp)

        # Configure queues on the bottleneck port
        self._configure_queues()

        # Start stats polling
        self._monitor_thread = hub.spawn(self._stats_monitor)
        logger.info("Switch %s connected, QoS flows installed.", dp.id)

    @set_ev_cls(ofp_event.EventOFPPacketIn, MAIN_DISPATCHER)
    def packet_in_handler(self, ev: ofp_event.EventOFPPacketIn) -> None:
        """Handle packets that don't match any flow entry (learning switch)."""
        msg = ev.msg
        dp = msg.datapath
        ofproto = dp.ofproto
        parser = dp.ofproto_parser
        in_port = msg.match["in_port"]

        pkt = packet.Packet(msg.data)
        eth = pkt.get_protocol(ethernet.ethernet)
        if eth is None:
            return

        if eth.ethertype == ether_types.ETH_TYPE_LLDP:
            return

        # Simple flooding for unknown packets
        actions = [parser.OFPActionOutput(ofproto.OFPP_FLOOD)]
        out = parser.OFPPacketOut(
            datapath=dp,
            buffer_id=msg.buffer_id,
            in_port=in_port,
            actions=actions,
            data=msg.data if msg.buffer_id == ofproto.OFP_NO_BUFFER else None,
        )
        dp.send_msg(out)

    @set_ev_cls(ofp_event.EventOFPFlowStatsReply, MAIN_DISPATCHER)
    def flow_stats_reply_handler(self, ev: ofp_event.EventOFPFlowStatsReply) -> None:
        """Process flow stats reply for monitoring."""
        for stat in ev.msg.body:
            match = stat.match
            udp_dst = match.get("udp_dst", None)
            if udp_dst is None:
                continue
            # Find traffic class
            tc_name = None
            for name, port in PORT_MAP.items():
                if port == udp_dst:
                    tc_name = name
                    break
            if tc_name is None:
                continue

            prev = self._prev_byte_counts.get(tc_name, 0)
            byte_diff = stat.byte_count - prev
            self._prev_byte_counts[tc_name] = stat.byte_count

            self._flow_stats[tc_name] = {
                "byte_count": stat.byte_count,
                "packet_count": stat.packet_count,
                "throughput_bps": byte_diff * 8,  # per-second (polled at 1s)
                "duration_sec": stat.duration_sec,
            }

    @set_ev_cls(ofp_event.EventOFPPortStatsReply, MAIN_DISPATCHER)
    def port_stats_reply_handler(self, ev: ofp_event.EventOFPPortStatsReply) -> None:
        """Process port stats reply."""
        for stat in ev.msg.body:
            self._port_stats[stat.port_no] = {
                "tx_bytes": stat.tx_bytes,
                "rx_bytes": stat.rx_bytes,
                "tx_packets": stat.tx_packets,
                "rx_packets": stat.rx_packets,
                "tx_dropped": stat.tx_dropped,
                "rx_dropped": stat.rx_dropped,
                "tx_errors": stat.tx_errors,
                "rx_errors": stat.rx_errors,
            }

    # ------------------------------------------------------------------
    # Flow installation
    # ------------------------------------------------------------------
    def _add_flow(
        self,
        dp,
        priority: int,
        match,
        actions: list,
        idle_timeout: int = 0,
        hard_timeout: int = 0,
        table_id: int = 0,
        meter_id: Optional[int] = None,
    ) -> None:
        """Install a flow entry on the datapath."""
        ofproto = dp.ofproto
        parser = dp.ofproto_parser

        inst = []
        if meter_id is not None:
            inst.append(parser.OFPInstructionMeter(meter_id))
        inst.append(parser.OFPInstructionActions(ofproto.OFPIT_APPLY_ACTIONS, actions))

        mod = parser.OFPFlowMod(
            datapath=dp,
            priority=priority,
            match=match,
            instructions=inst,
            idle_timeout=idle_timeout,
            hard_timeout=hard_timeout,
            table_id=table_id,
        )
        dp.send_msg(mod)

    def _install_qos_flows(self, dp) -> None:
        """Install per-class flows matching on UDP dst port + DSCP."""
        parser = dp.ofproto_parser
        ofproto = dp.ofproto

        # Queue IDs: voip=0, video=1, web=2, bulk=3
        for idx, tc_name in enumerate(PRIORITY_CLASSES):
            port_num = PORT_MAP[tc_name]
            dscp_val = {v: k for k, v in DSCP_MAP.items()}[tc_name]

            match = parser.OFPMatch(
                eth_type=ether_types.ETH_TYPE_IP,
                ip_proto=17,  # UDP
                udp_dst=port_num,
                ip_dscp=dscp_val,
            )

            actions = [
                parser.OFPActionSetQueue(idx),
                parser.OFPActionOutput(BOTTLENECK_PORT),
            ]

            meter = idx + 1 if self.policy in ("priority", "weighted", "adaptive") else None
            self._add_flow(dp, priority=100 + idx, match=match, actions=actions, meter_id=meter)

        logger.info("Installed QoS flow entries for policy=%s", self.policy)

    # ------------------------------------------------------------------
    # Queue configuration (OVS)
    # ------------------------------------------------------------------
    def _configure_queues(self) -> None:
        """Configure OVS HTB queues on the bottleneck interface."""
        iface = f"s1-eth{BOTTLENECK_PORT}"

        if self.policy == "fifo":
            self._configure_fifo_queues(iface)
        elif self.policy == "priority":
            self._configure_priority_queues(iface)
        elif self.policy in ("weighted", "adaptive"):
            self._configure_weighted_queues(iface)

    def _configure_fifo_queues(self, iface: str) -> None:
        """FIFO: single queue, no differentiation."""
        self._ovs_clear_qos(iface)
        cmds = [
            f"ovs-vsctl set port {iface} qos=@newqos -- "
            f"--id=@newqos create qos type=linux-htb other-config:max-rate={LINK_RATE_KBPS * 1000} "
            f"queues:0=@q0 -- "
            f"--id=@q0 create queue other-config:max-rate={LINK_RATE_KBPS * 1000}",
        ]
        for cmd in cmds:
            self._run_cmd(cmd)
        logger.info("FIFO queues configured on %s", iface)

    def _configure_priority_queues(self, iface: str) -> None:
        """Strict Priority: VoIP gets full rate, others get progressively less."""
        self._ovs_clear_qos(iface)
        max_rate = LINK_RATE_KBPS * 1000
        rates = {
            "voip": max_rate,
            "video": int(max_rate * 0.70),
            "web": int(max_rate * 0.40),
            "bulk": int(max_rate * 0.10),
        }
        cmd = (
            f"ovs-vsctl set port {iface} qos=@newqos -- "
            f"--id=@newqos create qos type=linux-htb other-config:max-rate={max_rate} "
            f"queues:0=@q0 queues:1=@q1 queues:2=@q2 queues:3=@q3 -- "
            f"--id=@q0 create queue other-config:min-rate={rates['voip']} other-config:max-rate={max_rate} other-config:priority=0 -- "
            f"--id=@q1 create queue other-config:min-rate={int(max_rate * 0.2)} other-config:max-rate={rates['video']} other-config:priority=1 -- "
            f"--id=@q2 create queue other-config:min-rate={int(max_rate * 0.1)} other-config:max-rate={rates['web']} other-config:priority=2 -- "
            f"--id=@q3 create queue other-config:max-rate={rates['bulk']} other-config:priority=3"
        )
        self._run_cmd(cmd)
        logger.info("Priority queues configured on %s", iface)

    def _configure_weighted_queues(self, iface: str) -> None:
        """Weighted Fair: distribute bandwidth according to weights."""
        self._ovs_clear_qos(iface)
        max_rate = LINK_RATE_KBPS * 1000
        total_w = sum(self.weights.values())

        parts = [f"ovs-vsctl set port {iface} qos=@newqos -- "]
        parts.append(
            f"--id=@newqos create qos type=linux-htb other-config:max-rate={max_rate} "
        )
        q_refs = []
        q_defs = []
        for idx, tc_name in enumerate(PRIORITY_CLASSES):
            w = self.weights.get(tc_name, 10)
            frac = w / total_w if total_w > 0 else 0.25
            min_rate = int(max_rate * frac)
            cap_pct = self.caps.get(tc_name, 100) / 100.0
            q_max = int(max_rate * cap_pct)
            q_refs.append(f"queues:{idx}=@q{idx}")
            q_defs.append(
                f"--id=@q{idx} create queue "
                f"other-config:min-rate={min_rate} "
                f"other-config:max-rate={q_max}"
            )

        parts.append(" ".join(q_refs) + " -- ")
        parts.append(" -- ".join(q_defs))
        cmd = "".join(parts)
        self._run_cmd(cmd)
        logger.info("Weighted queues configured on %s (weights=%s)", iface, self.weights)

    def _ovs_clear_qos(self, iface: str) -> None:
        """Remove existing QoS configuration from an interface."""
        self._run_cmd(f"ovs-vsctl clear port {iface} qos")
        self._run_cmd("ovs-vsctl -- --all destroy qos -- --all destroy queue")

    @staticmethod
    def _run_cmd(cmd: str) -> None:
        """Execute a shell command (for OVS configuration)."""
        try:
            subprocess.run(cmd, shell=True, check=True, capture_output=True, timeout=10)
        except subprocess.CalledProcessError as exc:
            logger.warning("OVS command failed: %s → %s", cmd, exc.stderr)
        except FileNotFoundError:
            logger.warning("OVS tools not found (expected in Mininet environment)")

    # ------------------------------------------------------------------
    # Meters (for Adaptive policy rate limiting)
    # ------------------------------------------------------------------
    def _install_meters(self, dp) -> None:
        """Install OpenFlow meters for each traffic class."""
        parser = dp.ofproto_parser
        ofproto = dp.ofproto
        max_rate = LINK_RATE_KBPS

        for idx, tc_name in enumerate(PRIORITY_CLASSES):
            meter_id = idx + 1
            w = self.weights.get(tc_name, 10)
            total_w = sum(self.weights.values())
            rate = int(max_rate * (w / total_w)) if total_w > 0 else int(max_rate / 4)
            cap_pct = self.caps.get(tc_name, 100) / 100.0
            rate = int(rate * cap_pct)

            bands = [
                parser.OFPMeterBandDrop(rate=rate, burst_size=rate // 10),
            ]
            req = parser.OFPMeterMod(
                datapath=dp,
                command=ofproto.OFPMC_ADD,
                flags=ofproto.OFPMF_KBPS,
                meter_id=meter_id,
                bands=bands,
            )
            dp.send_msg(req)

        logger.info("Installed meters for policy=%s", self.policy)

    def _update_meter(self, dp, tc_name: str, rate_kbps: int) -> None:
        """Update the meter rate for a specific traffic class."""
        parser = dp.ofproto_parser
        ofproto = dp.ofproto
        idx = PRIORITY_CLASSES.index(tc_name)
        meter_id = idx + 1

        bands = [
            parser.OFPMeterBandDrop(rate=rate_kbps, burst_size=max(1, rate_kbps // 10)),
        ]
        req = parser.OFPMeterMod(
            datapath=dp,
            command=ofproto.OFPMC_MODIFY,
            flags=ofproto.OFPMF_KBPS,
            meter_id=meter_id,
            bands=bands,
        )
        dp.send_msg(req)

    # ------------------------------------------------------------------
    # Stats polling and adaptive logic
    # ------------------------------------------------------------------
    def _stats_monitor(self) -> None:
        """Periodically poll flow/port stats and run adaptive logic."""
        while True:
            if self.datapath is None:
                hub.sleep(POLL_INTERVAL)
                continue

            dp = self.datapath
            parser = dp.ofproto_parser
            ofproto = dp.ofproto

            # Request flow stats
            req = parser.OFPFlowStatsRequest(dp, 0, ofproto.OFPTT_ALL)
            dp.send_msg(req)

            # Request port stats
            req = parser.OFPPortStatsRequest(dp, 0, ofproto.OFPP_ANY)
            dp.send_msg(req)

            hub.sleep(POLL_INTERVAL)

            # Adaptive evaluation
            if self.policy == "adaptive":
                self._adaptive_evaluate()

    def _adaptive_evaluate(self) -> None:
        """Evaluate conditions and adjust metering for adaptive policy."""
        if self.datapath is None:
            return

        # Calculate utilization from port stats
        port_info = self._port_stats.get(BOTTLENECK_PORT)
        if port_info is None:
            return

        total_tp_bps = sum(
            s.get("throughput_bps", 0) for s in self._flow_stats.values()
        )
        utilization = total_tp_bps / (LINK_RATE_KBPS * 1000) if LINK_RATE_KBPS > 0 else 0

        now = time.time()

        if utilization > 0.85:
            if not self._adaptive_escalated:
                self._adaptive_escalated = True
                self._adaptive_escalate_time = now
                # Throttle bulk
                self._update_meter(self.datapath, "bulk", int(LINK_RATE_KBPS * 0.10))
                self._update_meter(self.datapath, "web", int(LINK_RATE_KBPS * 0.20))
                logger.info("ADAPTIVE ESCALATE: util=%.1f%%, throttling bulk/web", utilization * 100)
                self.policy_log.append({
                    "timestamp": now,
                    "action": "escalate",
                    "utilization": utilization,
                    "detail": "Bulk metered to 10%, Web to 20%",
                })

        elif self._adaptive_escalated and utilization < 0.70:
            elapsed = now - self._adaptive_escalate_time
            if elapsed >= 10.0:  # 10-second hysteresis
                self._adaptive_escalated = False
                # Restore rates
                for tc_name in PRIORITY_CLASSES:
                    w = self.weights.get(tc_name, 10)
                    total_w = sum(self.weights.values())
                    rate = int(LINK_RATE_KBPS * (w / total_w)) if total_w > 0 else LINK_RATE_KBPS // 4
                    self._update_meter(self.datapath, tc_name, rate)
                logger.info("ADAPTIVE DE-ESCALATE: util=%.1f%%, restoring rates", utilization * 100)
                self.policy_log.append({
                    "timestamp": now,
                    "action": "de-escalate",
                    "utilization": utilization,
                    "detail": "All meter rates restored",
                })

    # ------------------------------------------------------------------
    # Public API (called by REST)
    # ------------------------------------------------------------------
    def change_policy(
        self,
        new_policy: str,
        weights: Optional[Dict[str, float]] = None,
        caps: Optional[Dict[str, float]] = None,
    ) -> dict:
        """Change the active QoS policy."""
        old_policy = self.policy
        self.policy = new_policy
        if weights:
            self.weights.update(weights)
        if caps:
            self.caps.update(caps)

        # Reconfigure queues and reinstall flows
        if self.datapath:
            self._configure_queues()
            self._install_qos_flows(self.datapath)
            if new_policy in ("priority", "weighted", "adaptive"):
                self._install_meters(self.datapath)

        # Reset adaptive state
        if new_policy != "adaptive":
            self._adaptive_escalated = False

        entry = {
            "timestamp": time.time(),
            "old_policy": old_policy,
            "new_policy": new_policy,
            "weights": dict(self.weights),
            "caps": dict(self.caps),
        }
        self.policy_log.append(entry)
        logger.info("Policy changed: %s → %s", old_policy, new_policy)
        return entry

    def get_stats(self) -> dict:
        """Return current stats snapshot."""
        return {
            "policy": self.policy,
            "weights": dict(self.weights),
            "caps": dict(self.caps),
            "flow_stats": dict(self._flow_stats),
            "port_stats": {str(k): v for k, v in self._port_stats.items()},
            "adaptive_escalated": self._adaptive_escalated,
            "policy_log": list(self.policy_log),
        }


# ---------------------------------------------------------------------------
# REST API
# ---------------------------------------------------------------------------
class QoSRestApi(ControllerBase):
    """REST API for runtime policy management."""

    def __init__(self, req, link, data, **config: Any) -> None:
        super().__init__(req, link, data, **config)
        self.controller: QoSController = data[REST_API_NAME]

    @route("qos", "/qos/policy", methods=["GET"])
    def get_policy(self, req, **kwargs: Any) -> Response:
        """GET /qos/policy – return current policy and stats."""
        body = json.dumps(self.controller.get_stats(), indent=2)
        return Response(content_type="application/json", body=body)

    @route("qos", "/qos/policy", methods=["POST"])
    def set_policy(self, req, **kwargs: Any) -> Response:
        """POST /qos/policy – change the active policy.

        Body: {"policy": "fifo|priority|weighted|adaptive", "weights": {...}, "caps": {...}}
        """
        try:
            data = json.loads(req.body)
        except (json.JSONDecodeError, TypeError):
            return Response(status=400, body="Invalid JSON")

        new_policy = data.get("policy")
        if new_policy not in ("fifo", "priority", "weighted", "adaptive"):
            return Response(status=400, body="Invalid policy")

        weights = data.get("weights")
        caps = data.get("caps")
        result = self.controller.change_policy(new_policy, weights, caps)
        body = json.dumps(result, indent=2)
        return Response(content_type="application/json", body=body)

    @route("qos", "/qos/stats", methods=["GET"])
    def get_stats(self, req, **kwargs: Any) -> Response:
        """GET /qos/stats – return flow and port statistics."""
        body = json.dumps(self.controller.get_stats(), indent=2)
        return Response(content_type="application/json", body=body)
