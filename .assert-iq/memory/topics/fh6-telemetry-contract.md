# FH6 telemetry contract

_Layer: Change risk / Outcome evidence. Source: live-console verification during
the dashboard build sessions (2026-08-27 → 2026-08-29)._

## Packet format — verified against a live Xbox

- FH6 "Data Out" uses the standard Forza **V2 / "Dash"** format. Base packet is
  **323 bytes** (offsets 0–322, through `NormalizedAIBrakeDifference`);
  `server/parser.js` sets `BASE_SIZE = 323`.
- **Observed live packet length is 324 bytes.** Confirmed 2026-08-28.
- **FH6 does NOT send the tire-wear extension.** Wear lives at offsets
  323/327/331/335 (4× f32), so a packet must be **≥ 339 bytes** for wear to be
  present. At 324 bytes it never is. `parser.js` gates it on
  `buf.length >= O.tireWearFL + 16`; `server/index.js` reports
  `hasTireWear: lastPacketLen >= 339` on the health endpoint.
  → Treat any wear-derived metric as permanently UNGRADED on FH6.
- Offsets in active use: `carOrdinal=212 (s32)`, `carClass=216`, `carPI=220`,
  `drivetrainType=224`, `numCylinders=228`, **232–243 = Horizon placeholder**,
  `speed=256 (m/s)`, `power=260 (W)`, `torque=264 (Nm)`,
  `tireTemp FL/FR/RL/RR = 268/272/276/280`, `boost=284 (PSI)`,
  `fuel=288 (fraction)`, `distanceTraveled=292 (m)`.

## Units — verified

- **Tire temps arrive as raw Fahrenheit**, not Celsius. Confirmed by plausibility
  check: 163–180 °F under 1 g cornering. Parser exposes both `tireTempF` (raw)
  and `tireTempC` (converted).
- **Speed is m/s** and confirmed correct: 45 m/s = 162 kph = 100 mph.
- The dashboard is **imperial throughout** (converted 2026-08-28): m/s→mph
  ×2.2369, m→in ×39.3701, m→mi ÷1609.344, C→F ×9/5+32.

## Known gaps in the telemetry itself

- **No car name string is ever transmitted.** Telemetry carries only a numeric
  `carOrdinal` (e.g. #3847) plus class / PI / drivetrain / cylinder count.
  Resolved 2026-08-28 by letting the user name the car manually, persisted to
  `localStorage` key `fh6.carName` and stamped into each recorded session's meta.
- FH6 only emits packets **while actively driving** — not in menus, pauses,
  replays, or after a race ends. A silent UDP socket is not evidence of a fault.

See also: [[tuning-engine-conventions]], [[recurring-defects]]
