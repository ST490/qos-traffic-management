# Priori — QoS Traffic Management System

> **Every packet is not equal.**

A real-time QoS traffic management system with a UDP traffic simulator, SDN policy engine, measurement backend, and an Awwwards-grade dashboard.

![Dashboard Preview](frontend/src/assets/hero.png)

## Architecture

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│   h1 (VoIP)  │   │  h2 (Video)  │   │   h3 (Web)   │   │  h4 (Bulk)   │
│  160B@50pps  │   │ 1200B@2Mbps  │   │  ~1.5 Mbps   │   │  ~10 Mbps    │
│  DSCP EF     │   │  DSCP AF41   │   │  DSCP AF21   │   │  Best Effort │
└──────┬───────┘   └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
       │                  │                  │                  │
       └──────────────────┴──────────────────┴──────────────────┘
                                    │
                              ┌─────┴─────┐
                              │   s1      │   Edge Switch
                              │ (OVS/Sim) │   (OpenFlow 1.3)
                              └─────┬─────┘
                                    │
                         ╔══════════╧══════════╗
                         ║   BOTTLENECK LINK   ║
                         ║   10 Mbps / 20 ms   ║
                         ║   100-pkt queue      ║
                         ║   tc/HTB shaping     ║
                         ╚══════════╤══════════╝
                                    │
                              ┌─────┴─────┐
                              │   s2      │   Core Switch
                              │ (OVS/Sim) │
                              └─────┬─────┘
                                    │
       ┌──────────────────┬──────────────────┬──────────────────┐
       │                  │                  │                  │
┌──────┴───────┐   ┌──────┴───────┐   ┌──────┴───────┐   ┌──────┴───────┐
│   h5 (Recv)  │   │   h6 (Recv)  │   │   h7 (Recv)  │   │   h8 (Recv)  │
│  Port 5001   │   │  Port 5002   │   │  Port 5003   │   │  Port 5004   │
└──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
```

## Stack

| Layer | Technology |
|-------|-----------|
| Simulation | Pure-Python event-driven model with heapq |
| Emulation | Mininet + Open vSwitch (OpenFlow 1.3) |
| Controller | Ryu SDN Framework (Python) |
| Traffic | Python 3 asyncio UDP sockets |
| Backend | FastAPI + WebSocket + SQLite |
| Frontend | React + Vite + TypeScript, Tailwind CSS, Framer Motion, GSAP, D3.js |

## QoS Policies

1. **FIFO** — No QoS, first-come-first-served
2. **Strict Priority** — VoIP > Video > Web > Bulk (lower priority starves under congestion)
3. **Weighted Fair** — Configurable weights (default 40/30/20/10) with work-conserving borrowing
4. **Adaptive** — Monitors utilisation; when >85% or priority class loss >2%, throttles Bulk and promotes affected class; de-escalates with 10s hysteresis

## Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+

### Setup
```bash
pip install -r requirements.txt
cd frontend && npm install && cd ..
```

### Run Simulation Mode (no Mininet required)
```bash
# Terminal 1: Start backend
python -m backend.run

# Terminal 2: Start frontend
cd frontend && npm run dev
```

Open http://localhost:5173 in your browser.

### Run Headless Verification
```bash
python scripts/verify_headless.py
```

### Run Tests
```bash
python tests/test_qos.py
```

## Project Structure

```
├── backend/           FastAPI server + SQLite persistence
│   ├── app.py         REST & WebSocket endpoints
│   ├── database.py    SQLite ORM layer
│   └── run.py         Entry point
├── controller/        Ryu SDN controller (emulation mode)
│   └── qos_controller.py
├── traffic/           Simulation & traffic generation
│   ├── models.py      Shared data models
│   ├── simulator.py   Event-driven simulation engine (927 lines)
│   ├── generator.py   Real UDP traffic generator
│   └── scenarios.py   Predefined experiment scenarios
├── frontend/          React + Vite dashboard
│   └── src/
│       ├── components/  UI components
│       ├── hooks/       WebSocket & API hooks
│       └── types.ts     TypeScript definitions
├── scripts/           Utility scripts
│   └── verify_headless.py
├── tests/             Unit & integration tests
│   └── test_qos.py
├── docs/              Documentation
├── Makefile           Build commands
└── requirements.txt   Python dependencies
```

## Metrics Collected

Per class, per second:
- **Throughput** (Mbps)
- **Latency** — avg, p95, p99 (ms)
- **Jitter** — RFC 3550 EWMA (ms)
- **Packet Loss** — from sequence gaps (%)
- **Jain's Fairness Index** — raw and demand-normalized
- **Bottleneck Utilisation** (%)

## Predefined Scenarios

| Scenario | Description |
|----------|-------------|
| Baseline | All defaults, FIFO, 60s |
| Congestion Ramp | Bulk 0→15 Mbps over 30s |
| Mid-Run Switch | FIFO for 30s → Priority |
| Fairness Stress | Equal demand, weighted policy |
| Adaptive Demo | FIFO → congestion → Adaptive at t=20s |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/state` | Current system state |
| POST | `/api/policy` | Change QoS policy |
| POST | `/api/traffic/{class}` | Modify traffic params |
| POST | `/api/scenario` | Run a scenario |
| POST | `/api/start` | Start simulation |
| POST | `/api/stop` | Stop simulation |
| GET | `/api/runs` | List all runs |
| GET | `/api/runs/{id}/metrics` | Get run metrics |
| GET | `/api/runs/{id}/export` | Export as CSV/JSON |
| WS | `/ws/live` | Real-time metrics at 1 Hz |

## License

MIT — Built as a Computer Networks project.
