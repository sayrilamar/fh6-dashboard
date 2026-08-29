# FH6 Race Engineer Dashboard

A real-time, F1-pit-wall-style telemetry dashboard for **Forza Horizon 6**, built for
**car tuning**. It listens to FH6's UDP "Data Out" stream from your Xbox, derives
race-engineer metrics (power band, traction circle, slip-angle balance, tire thermals,
suspension travel/damping) and serves a live browser dashboard over your LAN — plus
session recording with an automatic post-run **tuning report**.

```
Xbox (FH6 Data Out, UDP) ──▶ Node server (parse + derive) ──▶ WebSocket ──▶ Browser dashboard
```

## Requirements

- Node.js 18+ (uses built-in `dgram`/`http`, plus `ws`)
- The Xbox/console and this computer on the **same local network**

## Install

```bash
npm run setup      # installs server + client deps
```

## Run

**Production (recommended)** — builds the UI and serves everything from one port:

```bash
npm run build      # build the client once
npm start          # server: dashboard + WebSocket on :8080, UDP listener on :5300
```

Open **http://localhost:8080** (or `http://<this-computer-ip>:8080` from another device).

**Dev mode** — hot-reloading UI on :5173, server on :8080:

```bash
npm run dev
```

## Point Forza at this computer

1. Find this computer's LAN IP:
   - macOS: `ipconfig getifaddr en0` (or `en1` on Wi-Fi)
   - Windows: `ipconfig` → IPv4 Address
2. In **FH6 → Settings → HUD and Gameplay → "Data Out"**:
   - Data Out: **ON**
   - Data Out IP Address: **your computer's IP**
   - Data Out IP Port: **5300**
3. Start driving (FH6 only sends data while actively driving — not in menus,
   pauses, replays, or after a race). The top-bar dot turns green when telemetry arrives.

## Test without a console

A simulator generates realistic packets so you can verify the whole pipeline:

```bash
npm start          # in one terminal
npm run sim        # in another — synthetic car driving a lap at 60 Hz
```

## Recording & tuning reports

Click **RECORD** in the top bar (or it can be toggled any time). On stop, a summary is
written to `sessions/<timestamp>.summary.json` and the full frame log to
`sessions/<timestamp>.jsonl`. The **Sessions & Tuning Report** panel shows peak
power/torque (and the RPM they occur at — your shift point), max lateral/braking G,
top speed, best lap, and peak tire temps per corner.

## Reading the dashboard for tuning

| Panel | What it tells you | Tune it with |
|-------|-------------------|--------------|
| **Power Band** | HP/torque vs RPM at full throttle; peak-power RPM marker | Gear ratios & shift points; set final drive so top speed ≈ longest straight |
| **Tire Thermals** | Per-corner temp vs ideal window (blue cold → green ideal → red hot), slip %, wear | Tire pressure (hot = lower), camber, spring/ARB balance |
| **Grip & Balance** | Traction circle (lat vs long G) + understeer/oversteer from front-vs-rear slip angle | ARBs, springs, diff, toe |
| **Suspension** | Normalized travel per corner (1.0 = bottoming) + damper velocity | Ride height, spring rate, bump/rebound |
| **Race Engineer** | Live plain-language flags (overheating tire, bottoming, wheelspin, imbalance) | — |

## Configuration

Environment variables (server):

| Var | Default | Purpose |
|-----|---------|---------|
| `PORT` | `8080` | HTTP + WebSocket port |
| `UDP_PORT` | `5300` | Forza Data Out port (match the in-game setting) |
| `UDP_HOST` | `0.0.0.0` | UDP bind address |

## Packet format note

FH6 "Data Out" uses the standard Forza V2/"Dash" format — byte-for-byte identical to
FH5 (323-byte base, 12-byte Horizon placeholder at offsets 232–243, optional tire-wear
extension). See `server/parser.js` for the full annotated field map.
