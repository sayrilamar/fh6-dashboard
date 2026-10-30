# FH6 telemetry contract

_Layer: Change risk / Outcome evidence. Source: live-console verification during
the dashboard build sessions (2026-08-27 → 2026-10-30). This is the base layer:
other topics cite it, and it cites none of them._

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
- **Undecoded bytes are recorded raw since FH6-28** (2026-10-30): each frame
  keeps `rawPlaceholder` (232–243, hex) and `rawTail` (byte 323 onward). First
  reading, car #634 on a dirt event:
  - The placeholder's first int32 read **32 in every frame**.
  - Bytes 4–11 were non-zero in only 13 of 9,104 frames.
  - The trailing byte was always 0.

  Meaning unknown; it needs another car or event type to compare. The simulator
  sends zeros there.
- **No field names the event type, track or surface.** The driver labels the
  event on the pre-run card instead (FH6-28, 2026-10-30).

## Units — verified

- **Tire temps arrive as raw Fahrenheit**, not Celsius. Confirmed by plausibility
  check: 163–180 °F under 1 g cornering. Parser exposes both `tireTempF` (raw)
  and `tireTempC` (converted).
- **FH6 sends one rear temperature for both rear wheels.** Rear-left equals
  rear-right in 100% of frames on every car checked: #634 (RWD) on dirt and
  tarmac, and a 1991 Mazda 787B (#1335, AWD) on tarmac. The fronts differ
  (2.7–3.1 °F on average), so the parser's four offsets are right and the
  duplication is in the game's data. (measured 2026-10-29 and 2026-10-30)
- **Tire temperatures depend heavily on the surface.** Measured on car #634,
  2026-10-29/30:
  - **Dirt:** fronts sit around 70–90 °F and peak at 90–128 °F. No frame
    reached 140 °F in 13 dirt runs.
  - **Tarmac:** fronts typically read 136–137 °F, rears 143–145 °F, with peaks
    of 142–179 °F.
  - **Water:** `puddle` is per-wheel water depth. A crossing cools the tires
    about 45 °F in 5 seconds.
  - **Rumble:** `rumble` read 0 for whole runs on dirt and on tarmac, so it is
    no surface signal, and the kerb filters keyed on it never fire.
- **Speed is m/s** and confirmed correct: 45 m/s = 162 kph = 100 mph.
- The dashboard is **imperial throughout** (converted 2026-08-28): m/s→mph
  ×2.2369, m→in ×39.3701, m→mi ÷1609.344, C→F ×9/5+32.

## Race-state signals — measured at a real FH6 finish (2026-08-30)

Source: a recording that crossed a finish line, analysed for commit `de877f1`.
The first auto-stop attempt (`2de054d`) assumed the opposite on two counts and
never fired.

| Field | At the finish |
|---|---|
| `isRaceOn` | drops for only **~15 s**, then gameplay resumes. It **also** drops on pause and menus and cannot tell them apart — one mid-race pause lasted 38 s. |
| `currentRaceTime` | does **NOT** reset at the finish; it kept counting (113.38 → 126.31). |
| `distanceTraveled` | **resets** (5950 → 249). The odometer only goes backwards when the event ends — this is the definitive end-of-race marker. |
| `lapNumber` / `lastLap` | 0 → 1, and `lastLap` fills with the finishing time. |

- **The race clock is not a race signal**, measured 2026-10-29. FH6's
  pre-race screen already reports live gameplay:
  - `isRaceOn` is true, with the real car (not the `#0` grid placeholder)
  - the car is parked: speed 0, `racePosition` 0, odometer 0
  - `currentRaceTime` is running (153 s and 38 s in two runs), and it drops
    back at the green light

  Arming on "clock past 5 s", and stopping on "clock went backwards", ended
  every pre-armed recording at the race start.
- Since FH6-15 (`aa0305b`, 2026-10-29):
  - An armed capture begins once the car holds a race position or moves
    (> 0.5 m/s).
  - Only `racePosition > 0` proves a race.
  - The odometer reset is the only race-end stop, with a 60 s
    `isRaceOn`-gone fallback.
  - Free-roam recordings are stopped by hand, the user's stated preference
    (2026-08-30).
- Session duration ends at the last frame where gameplay was running, not when
  stop() was called (menus had inflated one run from 143 s to 447 s).

## Axes and tire slip angles — measured 2026-10-29

Measured on car #634 across 11 race recordings plus one straight-line toe
test.

- **`accel.x > 0` is a RIGHT turn.**
  - The left wheels compress more: `normSusp` left minus right is +0.12 front
    and +0.14 rear.
  - `steer` is positive (mean +0.16), so positive steer means right.
- **`slipAngle` is signed per wheel.** All four wheels read positive in right
  turns (+0.33 to +0.37 mean where |`accel.x`| > 5) and negative in left
  turns. So a wheel aimed right of its direction of travel reads positive.
- **Straight-line slip angle at toe 0 is 0.000 ± 0.01** per frame.
- **Toe shows up as a steady per-wheel offset**, with opposite signs left and
  right:
  - toe-in: RL > 0 and RR < 0
  - toe-out: RL < 0 and RR > 0

  This is how the toe sign was settled (the rule is in
  tuning-engine-conventions.md).

## Known gaps in the telemetry itself

- **No car name string is ever transmitted.** Telemetry carries only a numeric
  `carOrdinal` (e.g. #3847) plus class / PI / drivetrain / cylinder count.
  Resolved 2026-08-28 by letting the user name the car manually, persisted to
  `localStorage` key `fh6.carName` and stamped into each recorded session's meta.
- FH6 only emits packets **while actively driving** — not in menus, pauses,
  replays, or after a race ends. A silent UDP socket is not evidence of a fault.
- **Arrival check:** the server logs `[udp] packet length = N bytes` on the first
  packet it receives. If that line never appears, nothing has reached UDP 5300.
