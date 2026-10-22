"""Predefined experiment scenarios."""
import asyncio
import time
from typing import Callable, Optional
from .models import TrafficClass, PolicyMode


SCENARIOS = {
    "baseline": {
        "name": "Baseline",
        "description": "All traffic classes at default rates with FIFO policy for 60 seconds.",
        "duration": 60,
    },
    "congestion_ramp": {
        "name": "Congestion Ramp",
        "description": "Bulk traffic ramps from 0 to 15 Mbps over 30s, then holds for 30s. Shows congestion impact.",
        "duration": 60,
    },
    "mid_run_switch": {
        "name": "Mid-Run Policy Switch",
        "description": "Start with FIFO for 30s, then switch to Strict Priority. Shows QoS improvement.",
        "duration": 60,
    },
    "fairness_stress": {
        "name": "Fairness Stress",
        "description": "All classes demand equal bandwidth. Compare Jain's index across policies.",
        "duration": 60,
    },
    "adaptive_demo": {
        "name": "Adaptive Demo",
        "description": "Start with FIFO, ramp to congestion, auto-switch to Adaptive at t=20s. Shows autonomous QoS.",
        "duration": 60,
    },
}


class ScenarioRunner:
    """Runs predefined scenarios by controlling the simulation engine."""

    def __init__(
        self,
        engine,
        set_policy_fn: Callable,
        set_traffic_fn: Callable,
    ) -> None:
        self.engine = engine
        self.set_policy = set_policy_fn
        self.set_traffic = set_traffic_fn
        self._running = False

    async def run(self, scenario_name: str) -> str:
        """Run a named scenario. Returns run_id."""
        if scenario_name not in SCENARIOS:
            raise ValueError(f"Unknown scenario: {scenario_name}")

        scenario = SCENARIOS[scenario_name]
        self._running = True

        # Each scenario has its own logic
        runner = getattr(self, f"_run_{scenario_name}", None)
        if runner is None:
            raise ValueError(f"No runner for scenario: {scenario_name}")

        run_id = await runner(scenario)
        self._running = False
        return run_id

    async def _run_baseline(self, scenario: dict) -> str:
        """Baseline: all defaults, FIFO, 60s."""
        self.set_policy("fifo", {}, {})
        run_id = self.engine.start(duration=scenario["duration"])
        # Wait for completion
        while self.engine.running and self._running:
            await asyncio.sleep(0.5)
        return run_id

    async def _run_congestion_ramp(self, scenario: dict) -> str:
        """Ramp Bulk from 0 to 15 Mbps over 30s."""
        self.set_policy("fifo", {}, {})
        self.engine.set_bulk_rate(0.0)
        run_id = self.engine.start(duration=scenario["duration"])

        # Ramp over 30 seconds
        ramp_duration = 30
        target_rate = 15.0  # Mbps
        steps = 60
        for i in range(steps):
            if not self.engine.running or not self._running:
                break
            rate = target_rate * (i + 1) / steps
            self.engine.set_bulk_rate(rate)
            await asyncio.sleep(ramp_duration / steps)

        # Hold for remaining time
        while self.engine.running and self._running:
            await asyncio.sleep(0.5)
        return run_id

    async def _run_mid_run_switch(self, scenario: dict) -> str:
        """FIFO for 30s, then Priority."""
        self.set_policy("fifo", {}, {})
        self.engine.set_bulk_rate(12.0)  # Create congestion
        run_id = self.engine.start(duration=scenario["duration"])

        # Wait 30 seconds then switch
        await asyncio.sleep(30)
        if self.engine.running and self._running:
            self.set_policy("priority", {}, {})

        while self.engine.running and self._running:
            await asyncio.sleep(0.5)
        return run_id

    async def _run_fairness_stress(self, scenario: dict) -> str:
        """All classes at equal 3 Mbps demand."""
        self.set_policy(
            "weighted",
            {"voip": 25, "video": 25, "web": 25, "bulk": 25},
            {},
        )
        # Set all to ~3 Mbps
        self.engine.set_class_rate(TrafficClass.VOIP, 3.0)
        self.engine.set_class_rate(TrafficClass.VIDEO, 3.0)
        self.engine.set_class_rate(TrafficClass.WEB, 3.0)
        self.engine.set_class_rate(TrafficClass.BULK, 3.0)
        run_id = self.engine.start(duration=scenario["duration"])

        while self.engine.running and self._running:
            await asyncio.sleep(0.5)
        return run_id

    async def _run_adaptive_demo(self, scenario: dict) -> str:
        """FIFO → ramp → Adaptive auto-engage."""
        self.set_policy("fifo", {}, {})
        self.engine.set_bulk_rate(2.0)  # Start low
        run_id = self.engine.start(duration=scenario["duration"])

        # Ramp bulk over 15 seconds
        for i in range(30):
            if not self.engine.running or not self._running:
                break
            rate = 2.0 + (13.0 * (i + 1) / 30)
            self.engine.set_bulk_rate(rate)
            await asyncio.sleep(0.5)

        # Switch to adaptive at t=20s
        await asyncio.sleep(5)
        if self.engine.running and self._running:
            self.set_policy("adaptive", {}, {})

        while self.engine.running and self._running:
            await asyncio.sleep(0.5)
        return run_id

    def stop(self) -> None:
        """Stop the currently running scenario and engine."""
        self._running = False
        self.engine.stop()
