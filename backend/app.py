"""
FastAPI backend for the QoS Traffic Management System.

Provides REST API endpoints and a WebSocket for real-time dashboard updates.
Integrates with the SimulationEngine for traffic generation and measurement,
and persists all run data via the SQLite Database layer.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from typing import Any, Dict, List, Optional, Set

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, JSONResponse
from pydantic import BaseModel, Field

from backend.database import Database
from traffic.simulator import SimulationEngine
from traffic.scenarios import ScenarioRunner
from traffic.models import (
    PolicyMode,
    SystemState,
    TrafficClass,
    TRAFFIC_CLASS_CONFIG,
)

# ──────────────────────────── Logging ─────────────────────────────────
logger = logging.getLogger("qos.backend")

# ──────────────────────────── Pydantic request / response models ──────
class PolicyRequest(BaseModel):
    """Body for POST /api/policy."""
    mode: str = Field(..., description="One of fifo, priority, weighted, adaptive")
    weights: Optional[Dict[str, float]] = Field(
        None, description="Per-class weights (only for weighted / adaptive)"
    )
    caps: Optional[Dict[str, float]] = Field(
        None, description="Per-class bandwidth caps in percent (0-100)"
    )


class TrafficRequest(BaseModel):
    """Body for POST /api/traffic/{class_name}."""
    rate_mbps: Optional[float] = Field(None, ge=0, description="Target rate in Mbps")
    packet_size: Optional[int] = Field(None, ge=64, le=9000, description="Packet size in bytes")
    enabled: Optional[bool] = Field(None, description="Enable / disable the traffic class")


class StartRequest(BaseModel):
    """Body for POST /api/start."""
    mode: str = Field("simulation", description="simulation or emulation")
    policy: str = Field("fifo", description="Initial scheduling policy")
    duration: int = Field(60, ge=5, le=3600, description="Run duration in seconds")
    bottleneck_mbps: float = Field(10.0, ge=1, le=10000, description="Bottleneck link capacity")
    scenario: Optional[str] = Field(None, description="Optional named scenario to auto-run")


class ScenarioRequest(BaseModel):
    """Body for POST /api/scenario/{name}."""
    duration: Optional[int] = Field(None, ge=5, le=3600)


class StatusResponse(BaseModel):
    ok: bool
    message: str = ""


# ──────────────────────────── WebSocket connection manager ────────────
class ConnectionManager:
    """Keeps track of active WebSocket clients for broadcasting."""

    def __init__(self) -> None:
        self._connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._connections.add(ws)
        logger.info("WebSocket client connected (%d total)", len(self._connections))

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._connections.discard(ws)
        logger.info("WebSocket client disconnected (%d total)", len(self._connections))

    async def broadcast(self, data: dict) -> None:
        """Send JSON payload to every connected client, removing dead ones."""
        payload = json.dumps(data)
        dead: List[WebSocket] = []
        async with self._lock:
            targets = list(self._connections)
        for ws in targets:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                for ws in dead:
                    self._connections.discard(ws)


# ──────────────────────────── Application setup ───────────────────────
app = FastAPI(
    title="QoS Traffic Management API",
    version="1.0.0",
    description="Backend for the QoS Traffic Management & Fairness Dashboard",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Globals initialised in lifespan hooks
db: Database = None  # type: ignore[assignment]
engine: SimulationEngine = None  # type: ignore[assignment]
ws_manager: ConnectionManager = ConnectionManager()

# Background tasks
_broadcast_task: Optional[asyncio.Task] = None
_scenario_task: Optional[asyncio.Task] = None


# ──────────────────────────── Metrics callback ────────────────────────
def _on_metrics(snapshot: Any) -> None:
    """
    Called by SimulationEngine once per second with the latest system state.

    Persists data to SQLite and schedules a WebSocket broadcast.
    """
    if hasattr(snapshot, "to_dict"):
        snapshot = snapshot.to_dict()
    elif not isinstance(snapshot, dict):
        return

    run_id = snapshot.get("run_id", "")
    elapsed = snapshot.get("elapsed_seconds", 0)

    # Persist per-class metrics
    class_metrics: List[Dict[str, Any]] = []
    for tc_name, m in snapshot.get("metrics", {}).items():
        row = dict(m)
        row["traffic_class"] = tc_name
        class_metrics.append(row)
    if class_metrics:
        try:
            db.save_metrics(run_id, elapsed, class_metrics)
        except Exception:
            logger.exception("Failed to save metrics for elapsed=%d", elapsed)

    # Persist fairness
    try:
        db.save_fairness(
            run_id,
            elapsed,
            jain=snapshot.get("jain_fairness_index", 1.0),
            jain_norm=snapshot.get("jain_demand_normalized", 1.0),
            utilization=snapshot.get("bottleneck_utilization", 0.0),
            policy=snapshot.get("policy", "fifo"),
        )
    except Exception:
        logger.exception("Failed to save fairness for elapsed=%d", elapsed)

    # Persist policy changes if any
    for change in snapshot.get("new_policy_events", []):
        try:
            db.save_policy_change(run_id, elapsed, change)
        except Exception:
            logger.exception("Failed to save policy change")


# ──────────────────────────── Broadcast loop ──────────────────────────
async def _broadcast_loop() -> None:
    """Push the full system state over WebSocket at ~1 Hz."""
    while True:
        try:
            if engine is not None:
                state_dict = engine.state.to_dict()
                await ws_manager.broadcast(state_dict)
        except asyncio.CancelledError:
            break
        except Exception:
            logger.exception("Error in broadcast loop")
        await asyncio.sleep(1.0)


# ──────────────────────────── Lifecycle hooks ─────────────────────────
@app.on_event("startup")
async def startup_event() -> None:
    global db, engine, _broadcast_task

    db = Database()
    engine = SimulationEngine(metrics_callback=_on_metrics)
    _broadcast_task = asyncio.create_task(_broadcast_loop())
    run_id = engine.start(duration=86400)
    db.create_run(run_id=run_id, scenario="live", mode="simulation", policy=engine.policy, duration=86400)
    logger.info("QoS backend started — engine, DB, and live simulation active")


@app.on_event("shutdown")
async def shutdown_event() -> None:
    global _broadcast_task, _scenario_task

    # Stop running simulation
    if engine is not None and engine.state.running:
        engine.stop()
        if engine.state.run_id:
            db.end_run(engine.state.run_id)

    # Cancel background tasks
    if _broadcast_task is not None:
        _broadcast_task.cancel()
        try:
            await _broadcast_task
        except asyncio.CancelledError:
            pass

    if _scenario_task is not None and not _scenario_task.done():
        _scenario_task.cancel()
        try:
            await _scenario_task
        except asyncio.CancelledError:
            pass

    logger.info("QoS backend shut down")


# ══════════════════════════════════════════════════════════════════════
#                           REST ENDPOINTS
# ══════════════════════════════════════════════════════════════════════

# ── GET /api/state ────────────────────────────────────────────────────
@app.get("/api/state", tags=["state"])
async def get_state() -> Dict[str, Any]:
    """Return the current system state snapshot."""
    return engine.state.to_dict()


# ── POST /api/start ──────────────────────────────────────────────────
@app.post("/api/start", response_model=StatusResponse, tags=["control"])
async def start_simulation(body: StartRequest) -> StatusResponse:
    """Start a new simulation / emulation run."""
    if engine.state.running:
        raise HTTPException(status_code=409, detail="A run is already active. Stop it first.")

    # Validate policy
    try:
        PolicyMode(body.policy)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown policy '{body.policy}'. Choose from: {[m.value for m in PolicyMode]}",
        )

    run_id = f"run-{uuid.uuid4().hex[:8]}"
    db.create_run(
        run_id=run_id,
        scenario=body.scenario or "",
        mode=body.mode,
        policy=body.policy,
        duration=body.duration,
    )

    engine.configure(
        run_id=run_id,
        mode=body.mode,
        policy=body.policy,
        duration=body.duration,
        bottleneck_mbps=body.bottleneck_mbps,
    )
    engine.start()

    logger.info("Started run %s (policy=%s, duration=%ds)", run_id, body.policy, body.duration)
    return StatusResponse(ok=True, message=f"Run {run_id} started")


# ── POST /api/stop ───────────────────────────────────────────────────
@app.post("/api/stop", response_model=StatusResponse, tags=["control"])
async def stop_simulation() -> StatusResponse:
    """Stop the currently running simulation."""
    if not engine.state.running:
        raise HTTPException(status_code=409, detail="No run is active.")

    run_id = engine.state.run_id
    engine.stop()
    db.end_run(run_id)

    # Cancel any running scenario too
    global _scenario_task
    if _scenario_task is not None and not _scenario_task.done():
        _scenario_task.cancel()
        _scenario_task = None

    logger.info("Stopped run %s", run_id)
    return StatusResponse(ok=True, message=f"Run {run_id} stopped")


# ── POST /api/policy ────────────────────────────────────────────────
@app.post("/api/policy", response_model=StatusResponse, tags=["control"])
async def change_policy(body: PolicyRequest) -> StatusResponse:
    """Change the scheduling policy on the fly."""
    try:
        PolicyMode(body.mode)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown policy '{body.mode}'. Choose from: {[m.value for m in PolicyMode]}",
        )

    engine.set_policy(
        mode=body.mode,
        weights=body.weights,
        caps=body.caps,
        reason="User request via API",
    )
    logger.info("Policy changed to %s", body.mode)
    return StatusResponse(ok=True, message=f"Policy set to {body.mode}")


# ── POST /api/traffic/{class_name} ──────────────────────────────────
@app.post("/api/traffic/{class_name}", response_model=StatusResponse, tags=["traffic"])
async def modify_traffic(class_name: str, body: TrafficRequest) -> StatusResponse:
    """Modify traffic parameters for a specific traffic class."""
    try:
        tc = TrafficClass(class_name)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown class '{class_name}'. Choose from: {[c.value for c in TrafficClass]}",
        )

    engine.set_traffic_params(
        traffic_class=tc.value,
        rate_mbps=body.rate_mbps,
        packet_size=body.packet_size,
        enabled=body.enabled,
    )
    logger.info("Traffic %s updated: rate=%s, size=%s, enabled=%s",
                class_name, body.rate_mbps, body.packet_size, body.enabled)
    return StatusResponse(ok=True, message=f"Traffic class {class_name} updated")


# ── POST /api/scenario/{name} ───────────────────────────────────────
@app.post("/api/scenario/{name}", response_model=StatusResponse, tags=["scenarios"])
async def run_scenario(name: str, body: ScenarioRequest | None = None) -> StatusResponse:
    """Run a named scenario. If a run isn't active, starts one automatically."""
    global _scenario_task

    runner = ScenarioRunner(engine)
    available = runner.list_scenarios()
    if name not in available:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown scenario '{name}'. Available: {available}",
        )

    # Auto-start if not running
    if not engine.state.running:
        duration = body.duration if body and body.duration else 60
        run_id = f"run-{uuid.uuid4().hex[:8]}"
        db.create_run(run_id=run_id, scenario=name, policy="fifo", duration=duration)
        engine.configure(run_id=run_id, mode="simulation", policy="fifo",
                         duration=duration, bottleneck_mbps=10.0)
        engine.start()
        logger.info("Auto-started run %s for scenario %s", run_id, name)

    # Run scenario in background so it doesn't block
    if _scenario_task is not None and not _scenario_task.done():
        _scenario_task.cancel()

    async def _run_scenario() -> None:
        try:
            await asyncio.to_thread(runner.run, name)
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("Scenario %s failed", name)

    _scenario_task = asyncio.create_task(_run_scenario())
    logger.info("Scenario %s started", name)
    return StatusResponse(ok=True, message=f"Scenario '{name}' running")


# ── GET /api/metrics ─────────────────────────────────────────────────
@app.get("/api/metrics", tags=["data"])
async def get_metrics(run: Optional[str] = Query(None, description="Run ID")) -> Dict[str, Any]:
    """Return metrics for a specific run, or the current run if omitted."""
    target_run = run or engine.state.run_id
    if not target_run:
        raise HTTPException(status_code=400, detail="No run specified and no active run.")

    run_info = db.get_run(target_run)
    if run_info is None:
        raise HTTPException(status_code=404, detail=f"Run '{target_run}' not found.")

    return {
        "run": run_info,
        "metrics": db.get_metrics(target_run),
        "fairness": db.get_fairness(target_run),
        "policy_log": db.get_policy_log(target_run),
    }


# ── GET /api/runs ────────────────────────────────────────────────────
@app.get("/api/runs", tags=["data"])
async def list_runs() -> List[Dict[str, Any]]:
    """Return all recorded simulation runs."""
    return db.get_runs()


# ── GET /api/export/{run_id} ─────────────────────────────────────────
@app.get("/api/export/{run_id}", tags=["data"])
async def export_run(
    run_id: str,
    format: str = Query("json", description="Export format: json or csv"),
) -> Any:
    """Export run data as JSON or CSV."""
    run_info = db.get_run(run_id)
    if run_info is None:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found.")

    if format == "csv":
        csv_text = db.export_run_csv(run_id)
        if not csv_text:
            raise HTTPException(status_code=404, detail="No metrics found for this run.")
        return PlainTextResponse(
            content=csv_text,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={run_id}.csv"},
        )

    # Default to JSON
    return JSONResponse(content=db.export_run_json(run_id))


# ══════════════════════════════════════════════════════════════════════
#                           WEBSOCKET
# ══════════════════════════════════════════════════════════════════════

@app.websocket("/ws/live")
async def websocket_live(ws: WebSocket) -> None:
    """
    WebSocket endpoint that streams system state at ~1 Hz.

    Clients receive a JSON message every second containing:
    - Per-class metrics (throughput, latency, jitter, loss)
    - Jain's fairness index
    - Bottleneck utilization
    - Current policy and mode
    - Policy log entries
    """
    await ws_manager.connect(ws)
    try:
        # Send initial state immediately upon connection
        await ws.send_text(json.dumps(engine.state.to_dict()))

        # Keep connection alive; listen for client messages (e.g. pings)
        while True:
            try:
                msg = await asyncio.wait_for(ws.receive_text(), timeout=30.0)
                # Handle client-side pings or commands
                try:
                    data = json.loads(msg)
                    msg_type = data.get("type", "")
                    if msg_type == "ping":
                        await ws.send_text(json.dumps({"type": "pong"}))
                    elif msg_type == "get_state":
                        await ws.send_text(json.dumps(engine.state.to_dict()))
                except json.JSONDecodeError:
                    pass
            except asyncio.TimeoutError:
                # No message from client in 30 s — send a keep-alive
                try:
                    await ws.send_text(json.dumps({"type": "keepalive"}))
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("WebSocket error")
    finally:
        await ws_manager.disconnect(ws)


# ══════════════════════════════════════════════════════════════════════
#                         HEALTH / INFO
# ══════════════════════════════════════════════════════════════════════

@app.get("/api/health", tags=["meta"])
async def health() -> Dict[str, str]:
    """Simple health-check endpoint."""
    return {"status": "ok"}


@app.get("/api/info", tags=["meta"])
async def info() -> Dict[str, Any]:
    """Return server metadata: available policies, traffic classes, etc."""
    return {
        "policies": [m.value for m in PolicyMode],
        "traffic_classes": {
            tc.value: {
                "label": cfg["label"],
                "color": cfg["color"],
                "default_rate_mbps": cfg["default_rate_mbps"],
                "default_packet_size": cfg["default_packet_size"],
                "dscp": int(cfg["dscp"]),
                "priority": cfg["priority"],
            }
            for tc, cfg in TRAFFIC_CLASS_CONFIG.items()
        },
        "version": app.version,
    }
