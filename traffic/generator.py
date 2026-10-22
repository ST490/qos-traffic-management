"""
Real UDP traffic generator for emulation mode (Mininet).

Sender: creates UDP packets with PacketHeader, sends at specified rate.
Receiver: receives packets, extracts headers, computes metrics.
Supports all 4 traffic classes with their profiles.
Provides a CLI interface via argparse for standalone usage.
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import math
import random
import struct
import sys
import time
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional, Tuple

from .models import (
    DSCPValue,
    FlowMetrics,
    PacketHeader,
    TrafficClass,
    TRAFFIC_CLASS_CONFIG,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# UDP Sender
# ---------------------------------------------------------------------------
class UDPSender:
    """Sends UDP traffic for a single traffic class at a configurable rate."""

    def __init__(
        self,
        traffic_class: TrafficClass,
        dest_ip: str,
        dest_port: int,
        flow_id: int = 0,
        rate_mbps: Optional[float] = None,
        packet_size: Optional[int] = None,
        duration: float = 60.0,
        dscp: Optional[int] = None,
    ) -> None:
        self.traffic_class = traffic_class
        self.dest_ip = dest_ip
        self.dest_port = dest_port
        self.flow_id = flow_id
        self.duration = duration

        cfg = TRAFFIC_CLASS_CONFIG[traffic_class]
        self.rate_mbps = rate_mbps if rate_mbps is not None else cfg["default_rate_mbps"]
        self.packet_size = packet_size if packet_size is not None else cfg["default_packet_size"]
        self.dscp = dscp if dscp is not None else cfg["dscp"]

        self._seq: int = 0
        self._running: bool = False
        self._transport: Optional[asyncio.DatagramTransport] = None
        self._total_sent: int = 0

    async def start(self) -> None:
        """Start sending UDP packets for the configured duration."""
        loop = asyncio.get_running_loop()

        # Create UDP socket
        self._transport, _ = await loop.create_datagram_endpoint(
            lambda: asyncio.DatagramProtocol(),
            remote_addr=(self.dest_ip, self.dest_port),
        )

        # Set DSCP/TOS on the underlying socket
        try:
            sock = self._transport.get_extra_info("socket")
            if sock is not None:
                import socket as _socket
                tos = self.dscp << 2
                sock.setsockopt(_socket.IPPROTO_IP, _socket.IP_TOS, tos)
        except Exception as exc:
            logger.warning("Could not set DSCP: %s", exc)

        self._running = True
        logger.info(
            "Sender started: class=%s dest=%s:%d rate=%.3f Mbps size=%d duration=%.1fs",
            self.traffic_class.value,
            self.dest_ip,
            self.dest_port,
            self.rate_mbps,
            self.packet_size,
            self.duration,
        )

        try:
            if self.traffic_class == TrafficClass.VOIP:
                await self._send_cbr()
            elif self.traffic_class == TrafficClass.VIDEO:
                await self._send_video()
            elif self.traffic_class == TrafficClass.WEB:
                await self._send_web()
            elif self.traffic_class == TrafficClass.BULK:
                await self._send_cbr()
        finally:
            self.stop()

    def stop(self) -> None:
        """Stop sending."""
        self._running = False
        if self._transport is not None:
            self._transport.close()
            self._transport = None

    def _make_packet(self, size: Optional[int] = None) -> bytes:
        """Construct a UDP payload with measurement header + padding."""
        self._seq += 1
        hdr = PacketHeader(
            class_id=list(TrafficClass).index(self.traffic_class),
            flow_id=self.flow_id,
            seq_num=self._seq,
            send_ts_ns=time.monotonic_ns(),
        )
        payload = hdr.pack()
        pkt_size = size if size is not None else self.packet_size
        pad_len = max(0, pkt_size - len(payload))
        return payload + b"\x00" * pad_len

    async def _send_cbr(self) -> None:
        """Constant bit rate sender (VoIP, Bulk)."""
        pps = max(1, int(self.rate_mbps * 1e6 / (self.packet_size * 8)))
        interval = 1.0 / pps
        t_end = time.monotonic() + self.duration

        while self._running and time.monotonic() < t_end:
            pkt = self._make_packet()
            try:
                self._transport.sendto(pkt)
                self._total_sent += 1
            except Exception:
                pass
            await asyncio.sleep(interval)

    async def _send_video(self) -> None:
        """Video sender with I-frame bursts every 2 seconds."""
        pps = max(1, int(self.rate_mbps * 1e6 / (self.packet_size * 8)))
        interval = 1.0 / pps
        t_start = time.monotonic()
        t_end = t_start + self.duration
        burst_interval_s = 2.0
        next_burst = t_start + burst_interval_s

        while self._running and time.monotonic() < t_end:
            now = time.monotonic()
            # I-frame burst
            if now >= next_burst:
                burst_pkts = int(pps * 3 * 0.05)  # 3x rate for 50ms
                for _ in range(burst_pkts):
                    if not self._running:
                        break
                    pkt = self._make_packet()
                    try:
                        self._transport.sendto(pkt)
                        self._total_sent += 1
                    except Exception:
                        pass
                next_burst = now + burst_interval_s

            pkt = self._make_packet()
            try:
                self._transport.sendto(pkt)
                self._total_sent += 1
            except Exception:
                pass
            await asyncio.sleep(interval)

    async def _send_web(self) -> None:
        """Web traffic: Poisson arrivals, random packet sizes."""
        avg_size = 900
        pps = max(1, int(self.rate_mbps * 1e6 / (avg_size * 8)))
        t_end = time.monotonic() + self.duration

        while self._running and time.monotonic() < t_end:
            inter = random.expovariate(pps) if pps > 0 else 1.0
            await asyncio.sleep(inter)
            size = random.randint(400, 1400)
            pkt = self._make_packet(size=size)
            try:
                self._transport.sendto(pkt)
                self._total_sent += 1
            except Exception:
                pass


# ---------------------------------------------------------------------------
# UDP Receiver Protocol
# ---------------------------------------------------------------------------
class _ReceiverProtocol(asyncio.DatagramProtocol):
    """asyncio protocol that receives packets and accumulates metrics."""

    def __init__(self, class_name: str, metrics_cb: Optional[Callable] = None) -> None:
        self.class_name = class_name
        self.metrics_cb = metrics_cb
        self._pkts_received: int = 0
        self._bytes_received: int = 0
        self._latencies: List[float] = []
        self._last_seq: int = -1
        self._pkts_lost: int = 0
        self._prev_transit: Optional[float] = None
        self._jitter: float = 0.0
        self._lock = asyncio.Lock()
        self._second_start: float = time.monotonic()
        self._transport: Optional[asyncio.DatagramTransport] = None

    def connection_made(self, transport: asyncio.DatagramTransport) -> None:
        self._transport = transport

    def datagram_received(self, data: bytes, addr: Tuple[str, int]) -> None:
        recv_ns = time.monotonic_ns()
        if len(data) < PacketHeader.HEADER_SIZE:
            return

        hdr = PacketHeader.unpack(data)
        self._pkts_received += 1
        self._bytes_received += len(data)

        # Latency
        latency_ns = recv_ns - hdr.send_ts_ns
        latency_ms = latency_ns / 1e6
        self._latencies.append(latency_ms)

        # Loss detection via sequence gap
        if self._last_seq >= 0 and hdr.seq_num > self._last_seq + 1:
            gap = hdr.seq_num - self._last_seq - 1
            self._pkts_lost += gap
        self._last_seq = hdr.seq_num

        # RFC 3550 jitter
        transit = latency_ms
        if self._prev_transit is not None:
            diff = abs(transit - self._prev_transit)
            self._jitter += (diff - self._jitter) / 16.0
        self._prev_transit = transit

    def error_received(self, exc: Exception) -> None:
        logger.warning("Receiver error: %s", exc)

    def snapshot_and_reset(self) -> FlowMetrics:
        """Take a metrics snapshot for the last interval and reset counters."""
        now = time.monotonic()
        elapsed = now - self._second_start
        self._second_start = now

        lats = sorted(self._latencies) if self._latencies else []
        n = len(lats)
        avg_lat = sum(lats) / n if n else 0.0
        p95 = lats[int(n * 0.95)] if n > 1 else (lats[0] if n else 0.0)
        p99 = lats[int(n * 0.99)] if n > 1 else (lats[0] if n else 0.0)

        total_sent = self._pkts_received + self._pkts_lost
        loss_pct = (self._pkts_lost / total_sent * 100.0) if total_sent > 0 else 0.0
        throughput = (self._bytes_received * 8) / (elapsed * 1e6) if elapsed > 0 else 0.0

        fm = FlowMetrics(
            timestamp=time.time(),
            traffic_class=self.class_name,
            throughput_mbps=round(throughput, 4),
            latency_avg_ms=round(avg_lat, 3),
            latency_p95_ms=round(p95, 3),
            latency_p99_ms=round(p99, 3),
            jitter_ms=round(self._jitter, 3),
            loss_percent=round(loss_pct, 2),
            packets_sent=total_sent,
            packets_received=self._pkts_received,
            packets_lost=self._pkts_lost,
            bytes_received=self._bytes_received,
        )

        # Reset counters
        self._pkts_received = 0
        self._bytes_received = 0
        self._latencies.clear()
        self._pkts_lost = 0

        return fm


# ---------------------------------------------------------------------------
# UDP Receiver
# ---------------------------------------------------------------------------
class UDPReceiver:
    """Listens for UDP packets on a given port, collecting per-second metrics."""

    def __init__(
        self,
        traffic_class: TrafficClass,
        bind_ip: str = "0.0.0.0",
        bind_port: Optional[int] = None,
        duration: float = 60.0,
        metrics_callback: Optional[Callable] = None,
    ) -> None:
        self.traffic_class = traffic_class
        self.bind_ip = bind_ip
        self.bind_port = bind_port or TRAFFIC_CLASS_CONFIG[traffic_class]["port"]
        self.duration = duration
        self.metrics_callback = metrics_callback
        self._protocol: Optional[_ReceiverProtocol] = None
        self._transport: Optional[asyncio.DatagramTransport] = None

    async def start(self) -> None:
        """Start receiving packets and reporting metrics every second."""
        loop = asyncio.get_running_loop()
        self._transport, self._protocol = await loop.create_datagram_endpoint(
            lambda: _ReceiverProtocol(self.traffic_class.value, self.metrics_callback),
            local_addr=(self.bind_ip, self.bind_port),
        )

        logger.info(
            "Receiver started: class=%s bind=%s:%d duration=%.1fs",
            self.traffic_class.value,
            self.bind_ip,
            self.bind_port,
            self.duration,
        )

        t_end = time.monotonic() + self.duration
        try:
            while time.monotonic() < t_end:
                await asyncio.sleep(1.0)
                fm = self._protocol.snapshot_and_reset()
                if self.metrics_callback:
                    self.metrics_callback(fm)
                else:
                    logger.info(
                        "[%s] tp=%.3f Mbps lat=%.1f ms jit=%.2f ms loss=%.1f%%",
                        fm.traffic_class,
                        fm.throughput_mbps,
                        fm.latency_avg_ms,
                        fm.jitter_ms,
                        fm.loss_percent,
                    )
        finally:
            self._transport.close()

    def stop(self) -> None:
        """Stop receiving."""
        if self._transport:
            self._transport.close()


# ---------------------------------------------------------------------------
# Multi-flow manager (runs all 4 senders or receivers together)
# ---------------------------------------------------------------------------
class MultiFlowSender:
    """Launches senders for all traffic classes concurrently."""

    def __init__(
        self,
        dest_ip: str,
        duration: float = 60.0,
        rates: Optional[Dict[str, float]] = None,
    ) -> None:
        self.dest_ip = dest_ip
        self.duration = duration
        self.senders: List[UDPSender] = []
        for idx, tc in enumerate(TrafficClass):
            cfg = TRAFFIC_CLASS_CONFIG[tc]
            rate = rates.get(tc.value, cfg["default_rate_mbps"]) if rates else cfg["default_rate_mbps"]
            self.senders.append(UDPSender(
                traffic_class=tc,
                dest_ip=dest_ip,
                dest_port=cfg["port"],
                flow_id=idx,
                rate_mbps=rate,
                duration=duration,
            ))

    async def run(self) -> None:
        """Run all senders concurrently."""
        tasks = [asyncio.create_task(s.start()) for s in self.senders]
        await asyncio.gather(*tasks, return_exceptions=True)

    def stop(self) -> None:
        for s in self.senders:
            s.stop()


class MultiFlowReceiver:
    """Launches receivers for all traffic classes concurrently."""

    def __init__(
        self,
        bind_ip: str = "0.0.0.0",
        duration: float = 60.0,
        metrics_callback: Optional[Callable] = None,
    ) -> None:
        self.bind_ip = bind_ip
        self.duration = duration
        self.receivers: List[UDPReceiver] = []
        for tc in TrafficClass:
            self.receivers.append(UDPReceiver(
                traffic_class=tc,
                bind_ip=bind_ip,
                duration=duration,
                metrics_callback=metrics_callback,
            ))

    async def run(self) -> None:
        """Run all receivers concurrently."""
        tasks = [asyncio.create_task(r.start()) for r in self.receivers]
        await asyncio.gather(*tasks, return_exceptions=True)

    def stop(self) -> None:
        for r in self.receivers:
            r.stop()


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------
def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="QoS Traffic Generator – send/receive UDP traffic for measurement.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # ---- send ----
    sp = sub.add_parser("send", help="Send traffic for one or all classes")
    sp.add_argument("--dest", required=True, help="Destination IP address")
    sp.add_argument(
        "--class",
        dest="traffic_class",
        choices=[tc.value for tc in TrafficClass],
        default=None,
        help="Traffic class (omit for all classes)",
    )
    sp.add_argument("--rate", type=float, default=None, help="Rate in Mbps")
    sp.add_argument("--size", type=int, default=None, help="Packet size in bytes")
    sp.add_argument("--duration", type=float, default=60.0, help="Duration in seconds")

    # ---- receive ----
    rp = sub.add_parser("recv", help="Receive and measure traffic")
    rp.add_argument("--bind", default="0.0.0.0", help="Bind IP address")
    rp.add_argument(
        "--class",
        dest="traffic_class",
        choices=[tc.value for tc in TrafficClass],
        default=None,
        help="Traffic class (omit for all classes)",
    )
    rp.add_argument("--duration", type=float, default=60.0, help="Duration in seconds")

    return parser


def main() -> None:
    """CLI entry point."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    parser = _build_parser()
    args = parser.parse_args()

    if args.command == "send":
        if args.traffic_class:
            tc = TrafficClass(args.traffic_class)
            cfg = TRAFFIC_CLASS_CONFIG[tc]
            sender = UDPSender(
                traffic_class=tc,
                dest_ip=args.dest,
                dest_port=cfg["port"],
                rate_mbps=args.rate,
                packet_size=args.size,
                duration=args.duration,
            )
            asyncio.run(sender.start())
        else:
            rates: Dict[str, float] = {}
            if args.rate:
                for tc in TrafficClass:
                    rates[tc.value] = args.rate
            mfs = MultiFlowSender(dest_ip=args.dest, duration=args.duration, rates=rates or None)
            asyncio.run(mfs.run())

    elif args.command == "recv":
        if args.traffic_class:
            tc = TrafficClass(args.traffic_class)
            receiver = UDPReceiver(
                traffic_class=tc,
                bind_ip=args.bind,
                duration=args.duration,
            )
            asyncio.run(receiver.start())
        else:
            mfr = MultiFlowReceiver(bind_ip=args.bind, duration=args.duration)
            asyncio.run(mfr.run())


if __name__ == "__main__":
    main()
