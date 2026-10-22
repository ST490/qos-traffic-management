"""SQLite persistence layer for QoS metrics."""
import sqlite3
import json
import os
import csv
import io
from typing import List, Dict, Optional, Any
from datetime import datetime
from contextlib import contextmanager

DB_PATH = os.environ.get("QOS_DB_PATH", "qos_data.db")


class Database:
    """Thread-safe SQLite database for persisting QoS simulation runs and metrics."""

    def __init__(self, db_path: str = DB_PATH) -> None:
        self.db_path = db_path
        self._init_db()

    def _init_db(self) -> None:
        """Create tables if they don't exist."""
        with self._connect() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS runs (
                    run_id TEXT PRIMARY KEY,
                    started_at TEXT NOT NULL,
                    ended_at TEXT,
                    scenario TEXT,
                    mode TEXT DEFAULT 'simulation',
                    initial_policy TEXT DEFAULT 'fifo',
                    duration_seconds INTEGER,
                    status TEXT DEFAULT 'running',
                    metadata TEXT DEFAULT '{}'
                );

                CREATE TABLE IF NOT EXISTS metrics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id TEXT NOT NULL,
                    timestamp REAL NOT NULL,
                    elapsed_seconds INTEGER NOT NULL,
                    traffic_class TEXT NOT NULL,
                    throughput_mbps REAL DEFAULT 0,
                    latency_avg_ms REAL DEFAULT 0,
                    latency_p95_ms REAL DEFAULT 0,
                    latency_p99_ms REAL DEFAULT 0,
                    jitter_ms REAL DEFAULT 0,
                    loss_percent REAL DEFAULT 0,
                    packets_sent INTEGER DEFAULT 0,
                    packets_received INTEGER DEFAULT 0,
                    packets_lost INTEGER DEFAULT 0,
                    bytes_received INTEGER DEFAULT 0,
                    FOREIGN KEY (run_id) REFERENCES runs(run_id)
                );

                CREATE TABLE IF NOT EXISTS fairness (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id TEXT NOT NULL,
                    timestamp REAL NOT NULL,
                    elapsed_seconds INTEGER NOT NULL,
                    jain_index REAL DEFAULT 1.0,
                    jain_demand_normalized REAL DEFAULT 1.0,
                    bottleneck_utilization REAL DEFAULT 0.0,
                    active_policy TEXT DEFAULT 'fifo',
                    FOREIGN KEY (run_id) REFERENCES runs(run_id)
                );

                CREATE TABLE IF NOT EXISTS policy_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id TEXT NOT NULL,
                    timestamp REAL NOT NULL,
                    elapsed_seconds INTEGER NOT NULL,
                    old_policy TEXT,
                    new_policy TEXT,
                    reason TEXT,
                    weights_before TEXT,
                    weights_after TEXT,
                    caps_before TEXT,
                    caps_after TEXT,
                    FOREIGN KEY (run_id) REFERENCES runs(run_id)
                );

                CREATE INDEX IF NOT EXISTS idx_metrics_run ON metrics(run_id, elapsed_seconds);
                CREATE INDEX IF NOT EXISTS idx_fairness_run ON fairness(run_id, elapsed_seconds);
                CREATE INDEX IF NOT EXISTS idx_policy_log_run ON policy_log(run_id);
            """)

    @contextmanager
    def _connect(self):
        """Context manager yielding a SQLite connection with auto-commit."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    # ──────────────────────────── Run CRUD ────────────────────────────

    def create_run(
        self,
        run_id: str,
        scenario: str = "",
        mode: str = "simulation",
        policy: str = "fifo",
        duration: int = 60,
    ) -> str:
        """Insert a new simulation run and return its ID."""
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO runs (run_id, started_at, scenario, mode, initial_policy, duration_seconds) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (run_id, datetime.utcnow().isoformat(), scenario, mode, policy, duration),
            )
        return run_id

    def end_run(self, run_id: str) -> None:
        """Mark a run as completed."""
        with self._connect() as conn:
            conn.execute(
                "UPDATE runs SET ended_at = ?, status = 'completed' WHERE run_id = ?",
                (datetime.utcnow().isoformat(), run_id),
            )

    def get_runs(self) -> List[Dict[str, Any]]:
        """Return all runs ordered by most recent first."""
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM runs ORDER BY started_at DESC").fetchall()
            return [dict(r) for r in rows]

    def get_run(self, run_id: str) -> Optional[Dict[str, Any]]:
        """Return a single run by ID, or None."""
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM runs WHERE run_id = ?", (run_id,)).fetchone()
            return dict(row) if row else None

    # ──────────────────────────── Metrics ─────────────────────────────

    def save_metrics(self, run_id: str, elapsed: int, metrics_list: List[Dict[str, Any]]) -> None:
        """Persist a batch of per-class metric snapshots."""
        with self._connect() as conn:
            for m in metrics_list:
                conn.execute(
                    """INSERT INTO metrics (run_id, timestamp, elapsed_seconds, traffic_class,
                       throughput_mbps, latency_avg_ms, latency_p95_ms, latency_p99_ms,
                       jitter_ms, loss_percent, packets_sent, packets_received, packets_lost,
                       bytes_received)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        run_id,
                        m.get("timestamp", 0),
                        elapsed,
                        m["traffic_class"],
                        m.get("throughput_mbps", 0),
                        m.get("latency_avg_ms", 0),
                        m.get("latency_p95_ms", 0),
                        m.get("latency_p99_ms", 0),
                        m.get("jitter_ms", 0),
                        m.get("loss_percent", 0),
                        m.get("packets_sent", 0),
                        m.get("packets_received", 0),
                        m.get("packets_lost", 0),
                        m.get("bytes_received", 0),
                    ),
                )

    def get_metrics(self, run_id: str) -> List[Dict[str, Any]]:
        """Return all metrics rows for a run."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM metrics WHERE run_id = ? ORDER BY elapsed_seconds, traffic_class",
                (run_id,),
            ).fetchall()
            return [dict(r) for r in rows]

    # ──────────────────────────── Fairness ────────────────────────────

    def save_fairness(
        self,
        run_id: str,
        elapsed: int,
        jain: float,
        jain_norm: float,
        utilization: float,
        policy: str,
    ) -> None:
        """Persist a fairness snapshot."""
        with self._connect() as conn:
            conn.execute(
                """INSERT INTO fairness (run_id, timestamp, elapsed_seconds, jain_index,
                   jain_demand_normalized, bottleneck_utilization, active_policy)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (run_id, datetime.utcnow().timestamp(), elapsed, jain, jain_norm, utilization, policy),
            )

    def get_fairness(self, run_id: str) -> List[Dict[str, Any]]:
        """Return all fairness rows for a run."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM fairness WHERE run_id = ? ORDER BY elapsed_seconds",
                (run_id,),
            ).fetchall()
            return [dict(r) for r in rows]

    # ──────────────────────────── Policy log ──────────────────────────

    def save_policy_change(self, run_id: str, elapsed: int, change: Dict[str, Any]) -> None:
        """Persist a policy-change event."""
        with self._connect() as conn:
            conn.execute(
                """INSERT INTO policy_log (run_id, timestamp, elapsed_seconds, old_policy,
                   new_policy, reason, weights_before, weights_after, caps_before, caps_after)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    run_id,
                    change.get("timestamp", 0),
                    elapsed,
                    change.get("old_policy", ""),
                    change.get("new_policy", ""),
                    change.get("reason", ""),
                    json.dumps(change.get("weights_before", {})),
                    json.dumps(change.get("weights_after", {})),
                    json.dumps(change.get("caps_before", {})),
                    json.dumps(change.get("caps_after", {})),
                ),
            )

    def get_policy_log(self, run_id: str) -> List[Dict[str, Any]]:
        """Return all policy-change entries for a run, with parsed JSON fields."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM policy_log WHERE run_id = ? ORDER BY elapsed_seconds",
                (run_id,),
            ).fetchall()
            result: List[Dict[str, Any]] = []
            for r in rows:
                d = dict(r)
                d["weights_before"] = json.loads(d.get("weights_before", "{}"))
                d["weights_after"] = json.loads(d.get("weights_after", "{}"))
                d["caps_before"] = json.loads(d.get("caps_before", "{}"))
                d["caps_after"] = json.loads(d.get("caps_after", "{}"))
                result.append(d)
            return result

    # ──────────────────────────── Export ───────────────────────────────

    def export_run_csv(self, run_id: str) -> str:
        """Export all metrics for a run as CSV text."""
        metrics = self.get_metrics(run_id)
        if not metrics:
            return ""
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=metrics[0].keys())
        writer.writeheader()
        writer.writerows(metrics)
        return output.getvalue()

    def export_run_json(self, run_id: str) -> Dict[str, Any]:
        """Export full run data (run info, metrics, fairness, policy log) as a dict."""
        return {
            "run": self.get_run(run_id),
            "metrics": self.get_metrics(run_id),
            "fairness": self.get_fairness(run_id),
            "policy_log": self.get_policy_log(run_id),
        }
