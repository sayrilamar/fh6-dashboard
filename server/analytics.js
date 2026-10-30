// Session analytics: turn a recorded run into measured engineering numbers
// (a single grip coefficient, a fitted aero slope, roll/pitch gradients, a
// dyno-from-data, CdA from terminal velocity, rolling radius, diff-tuning slip).
//
// Everything here is computed from CLEAN frames only — IsRaceOn, off the rumble
// strip, out of puddles, tires still gripping (|combined slip| < 1.0), and no
// physically impossible (>3 g) impact spikes. That filtering is what turns a
// 2.x g curb-strike spike into a real ~1.4-1.5 g sustained grip number.

const MS_TO_MPH = 2.2369362920544;
const RAD_TO_DEG = 57.29577951308232;
const M_TO_IN = 39.3700787;
const M_TO_FT = 3.2808399;
const RHO = 1.225;
const WOT_BIN_MS = 2;    // speed-histogram bin width, m/s
const WOT_BINS = 60;     // 0-120 m/s // air density kg/m^3
const V100 = 44.704; // 100 mph in m/s
// Tire grip window (°F), matching metrics.js TIRE. Ideal ~175; below cold or above
// hot loses grip. Used to pressure-tune tires toward the window.
const MPH60 = 26.8224; // 60 mph in m/s
const MPH100 = 44.704; // 100 mph in m/s
const MPH_TO_MS_0_4 = 0.4 * 0.44704; // ~0.4 mph in m/s ("stopped" threshold)

export function isCleanFrame(t, d) {
  if (!t || !d || !t.isRaceOn) return false;
  const r = t.rumble, p = t.puddle, cs = t.combinedSlip;
  if (r && Math.max(r.fl, r.fr, r.rl, r.rr) > 0.1) return false; // on a kerb
  if (p && Math.max(p.fl, p.fr, p.rl, p.rr) > 0.1) return false; // in a puddle
  if (cs && Math.max(Math.abs(cs.fl), Math.abs(cs.fr), Math.abs(cs.rl), Math.abs(cs.rr)) > 1.0) return false; // sliding
  if (d.g.combined > 3.0) return false; // no road car sustains >3 g — it's an impact
  return true;
}

// Per-session accumulator. Stored on the recorder's agg so live recording and
// jsonl replay share one code path.
export function freshAnalytics() {
  return {
    latSigned: [], longSigned: [], speed: [], roll: [], pitch: [], slipFront: [], slipRear: [],
    cdaSpeed: 0, cdaPower: 0,
    // Where the car is actually ON POWER, by speed. The final-drive solver weights its
    // objective by this: making more force at a speed you never accelerate through is
    // worth nothing, and this is the only honest way to know which speeds those are.
    // 2 m/s bins, 0-120 m/s (0-268 mph).
    wotSpeed: new Array(WOT_BINS).fill(0),
    rrFront: 0, rrRear: 0, rrCount: 0,
    accelSlipF: [], accelSlipR: [], brakeSlipF: [], brakeSlipR: [],
    // reference-speed grip: |lateral g| samples in a 55-65 mph window (≈ the
    // car's mechanical grip, matching the spreadsheet's "lateral G @ 60 mph").
    lat60: [],
    // standing-start acceleration timing (best of session)
    runT0: null, run60done: false, run100done: false,
    best0to60: Infinity, best0to100: Infinity,
    // 60-0 braking: kinematic detection (no full stop needed) — measures the
    // decel of the 60→(lowest) segment and extrapolates to a full stop.
    prevSpeed: 0, b60: null,
    best60to0Dist: Infinity, best60to0Decel: 0,
    // Powertrain: traction crossover + launch quality (full-throttle behavior).
    // Crossover uses per-5mph-bin spin fractions (robust to stray high-speed
    // slip spikes); launch quality is judged from launchZone slip + g below.
    wotBinTotal: {}, // speedBin(mph/5) -> full-throttle frame count
    wotBinSpin: {},  // speedBin -> full-throttle frames breaking traction
    // Launch zone (4–32 mph, full throttle), captured IN ORDER so slip can be
    // smoothed. The honest launch-quality signal is longitudinal g, not raw slip
    // ratio: Forza's slip ratio is denominator-noisy at low speed and reads high
    // even for a car that's hooking up at its grip peak. A launch is only truly
    // traction-limited when the wheels slip a lot AND the car fails to accelerate.
    launchZoneSlip: [], // driven-wheel slip ratio, in order
    launchZoneG: [],    // longitudinal g at the same frame, in order
    launchZoneRpm: [],  // engine rpm at the same frame (to spot a bogging, over-tall 1st)
    // Handling: balance by corner phase (entry/mid/exit), rear-slide events,
    // braking stability. Phase from brake/throttle at each cornering frame.
    cornerFrames: 0,
    balEntry: { os: 0, us: 0, n: 0 }, balMid: { os: 0, us: 0, n: 0 }, balExit: { os: 0, us: 0, n: 0 },
    // Speed-banded cornering balance (mean angleBalance = rear slip − front slip) for
    // AERO: if the car gets more understeery/oversteery at HIGH speed vs LOW speed,
    // that's a downforce-balance shift (aero acts with speed²).
    aeroLoSum: 0, aeroLoN: 0, aeroHiSum: 0, aeroHiN: 0,
    slideEvents: 0, slideFrames: 0, prevSlide: false,
    // Rear-slide events classified by PHYSICAL cause (signed rear slip ratio):
    //   trailBrake = braking + rear locking, power = throttle + rear spinning,
    //   grip = lateral grip loss (high slip angle, little long. slip).
    slideCause: { trailBrake: 0, power: 0, grip: 0 },
    slideCauseSpeeds: { trailBrake: [], power: [], grip: [] },
    brakeFrames: 0, brakeRearLoose: 0, brakeFrontLock: 0,
    // Corner-exit longitudinal g (on power while still turning) — the ax for
    // the weight-transfer formula ΔW = M·ax·h/L.
    cornerExitAx: [],
    // CG-height measurement inputs: front suspension travel (in) vs braking g
    // AND speed (for the aero term), over clean low-lateral braking. A multiple
    // regression separates the weight-transfer compression (per g) from aero
    // (per v²), so it works even on a fast track where braking is high-speed.
    cgBrakeG: [], cgFrontTravel: [], cgSpeed: [],
    // Braking entry speed: the speed each time you get hard on the brakes.
    brakeEntrySpeeds: [], prevBraking: false,
    // Damper velocities (in/s) split compression (bump) / extension (rebound),
    // per axle, plus full-droop (topping) counts — the damping indicators.
    damperFrontComp: [], damperFrontExt: [], damperRearComp: [], damperRearExt: [],
    topFront: 0, topRear: 0,
    // Per-END normalized bump travel (1.0 = bottoming), worst wheel on each end, on
    // clean frames. Drives ride-height: near 1.0 = bottoming (raise); well below =
    // headroom to lower for a lower CG / more aero.
    suspCompFront: [], suspCompRear: [],
    // Tire temperatures, shown as information (see addTireTemps).
    ...freshTireTemps(),
  };
}

// Fold one frame into the analytics accumulator. `ts` is the frame timestamp
// (ms) — used for the acceleration/braking timing runs.
export function addAnalyticsFrame(an, t, d, ts = 0) {
  if (isCleanFrame(t, d)) {
    an.latSigned.push(d.g.lat);
    an.longSigned.push(d.g.long);
    an.speed.push(t.speed);
    an.roll.push(t.roll);
    an.pitch.push(t.pitch);
    an.slipFront.push((Math.abs(t.slipAngle.fl) + Math.abs(t.slipAngle.fr)) / 2);
    an.slipRear.push((Math.abs(t.slipAngle.rl) + Math.abs(t.slipAngle.rr)) / 2);

    // Reference-speed grip: clean lateral g in a 55-65 mph window.
    const mph = t.speed * MS_TO_MPH;
    if (mph >= 55 && mph <= 65) an.lat60.push(Math.abs(d.g.lat));

    // On-power speed histogram (see wotSpeed above). Full throttle and actually
    // gaining speed — coasting at the limiter is not an acceleration opportunity.
    if (t.throttle > 0.9 && d.g.long > 0.02) {
      const b = Math.floor(t.speed / WOT_BIN_MS);
      if (b >= 0 && b < WOT_BINS) an.wotSpeed[b]++;
    }

    // CdA: fastest essentially-non-accelerating full-throttle clean frame ≈ true
    // terminal velocity, where engine power balances aero drag. The tight accel
    // gate matters — if the car is still pulling, power > drag and CdA inflates.
    if (t.throttle > 0.95 && Math.abs(d.g.long) < 0.02 && t.speed > an.cdaSpeed) {
      an.cdaSpeed = t.speed;
      an.cdaPower = t.power;
    }
    // Rolling radius at steady cruise (no accel, no cornering): r = v / ω.
    if (Math.abs(d.g.long) < 0.05 && Math.abs(d.g.lat) < 0.1 && t.speed > 15) {
      const wf = (t.wheelSpeed.fl + t.wheelSpeed.fr) / 2;
      const wr = (t.wheelSpeed.rl + t.wheelSpeed.rr) / 2;
      if (wf > 1 && wr > 1) {
        an.rrFront += t.speed / wf;
        an.rrRear += t.speed / wr;
        an.rrCount++;
      }
    }
  }

  // Diff-tuning slip: high slip IS the signal here, so don't require clean grip
  // — only skip kerb/puddle frames. Gate on speed > 8 m/s: slip ratio is
  // (wheel−ground)/ground, which blows up to meaningless values near a standstill
  // (launch), so low-speed frames would otherwise dominate.
  const onSurface =
    (t.rumble && Math.max(t.rumble.fl, t.rumble.fr, t.rumble.rl, t.rumble.rr) > 0.1) ||
    (t.puddle && Math.max(t.puddle.fl, t.puddle.fr, t.puddle.rl, t.puddle.rr) > 0.1);
  if (!onSurface && t.speed > 8) {
    const slF = (Math.abs(t.slipRatio.fl) + Math.abs(t.slipRatio.fr)) / 2;
    const slR = (Math.abs(t.slipRatio.rl) + Math.abs(t.slipRatio.rr)) / 2;
    if (t.throttle > 0.8) { an.accelSlipF.push(slF); an.accelSlipR.push(slR); }
    if (t.brake > 0.5) { an.brakeSlipF.push(slF); an.brakeSlipR.push(slR); }
  }

  addTireTemps(an, t);

  // Traction crossover + launch: how the DRIVEN wheels behave at full throttle.
  // Below the crossover speed the car is grip-limited (spins); above it, power-
  // limited. d.driven.drivenSlip is already drivetrain-aware. Keep the crossover
  // bins above 2 m/s (slip ratio is noisy near a standstill).
  if (!onSurface && t.throttle > 0.9 && t.speed > 2) {
    const mph = t.speed * MS_TO_MPH;
    const slip = d.driven.drivenSlip;
    const bin = Math.floor(mph / 5);
    an.wotBinTotal[bin] = (an.wotBinTotal[bin] || 0) + 1;
    if (slip > 0.15) an.wotBinSpin[bin] = (an.wotBinSpin[bin] || 0) + 1;
  }
  // Launch zone: full throttle from 4 mph (below that Forza's slip ratio is
  // denominator-noise — see launchZoneSlip note) up to 32 mph. Store slip and the
  // longitudinal g at the same frame, in order, so we can smooth the slip and — the
  // key part — check whether high slip is actually costing acceleration.
  {
    const mph = t.speed * MS_TO_MPH;
    if (!onSurface && t.throttle > 0.9 && mph >= 4 && mph < 32) {
      an.launchZoneSlip.push(Math.min(2, d.driven.drivenSlip));
      an.launchZoneG.push(d.g.long);
      an.launchZoneRpm.push(t.currentRpm);
    }
  }

  // Handling balance by corner phase + rear-slide (spin) events.
  if (!onSurface && Math.abs(d.g.lat) > 0.35) {
    an.cornerFrames++;
    const phase = t.brake > 0.15 ? 'entry' : t.throttle > 0.5 ? 'exit' : 'mid';
    const bucket = phase === 'entry' ? an.balEntry : phase === 'exit' ? an.balExit : an.balMid;
    const ab = d.balance.angleBalance; // rear slip − front slip (>0 = oversteer)
    if (ab > 2) bucket.os++; else if (ab < -2) bucket.us++; else bucket.n++;
    // Speed-banded raw balance for aero (real cornering only). Bands: LOW ≤ 27 m/s
    // (~60 mph), HIGH ≥ 38 m/s (~85 mph). The high−low SHIFT is the aero signal.
    if (Math.abs(d.g.lat) > 0.5) {
      if (t.speed <= 27) { an.aeroLoSum += ab; an.aeroLoN++; }
      else if (t.speed >= 38) { an.aeroHiSum += ab; an.aeroHiN++; }
    }
    // Rear-slide: rear tires past the grip limit AND rear-led (not a 4-wheel push).
    const rearSlide = Math.max(Math.abs(t.combinedSlip.rl), Math.abs(t.combinedSlip.rr));
    const frontSlide = Math.max(Math.abs(t.combinedSlip.fl), Math.abs(t.combinedSlip.fr));
    const sliding = rearSlide > 1.0 && rearSlide > frontSlide * 1.2;
    if (sliding) {
      an.slideFrames++;
      if (!an.prevSlide) {
        an.slideEvents++;
        // Classify by cause at slide ONSET using signed rear longitudinal slip:
        // negative = rear locking (braking), positive = rear spinning (power).
        const rSR = (t.slipRatio.rl + t.slipRatio.rr) / 2;
        const cause = t.brake > 0.12 && rSR < -0.1 ? 'trailBrake'
          : t.throttle > 0.45 && rSR > 0.1 ? 'power'
          : t.brake > 0.12 ? 'trailBrake' // braking + rear away, even if lateral-led
          : 'grip';
        an.slideCause[cause]++;
        an.slideCauseSpeeds[cause].push(t.speed * MS_TO_MPH);
      }
    }
    an.prevSlide = sliding;
  } else {
    an.prevSlide = false;
  }

  // Braking stability: which end loses grip first under braking.
  if (!onSurface && t.brake > 0.3 && t.speed > 10) {
    an.brakeFrames++;
    const fr = (Math.abs(t.slipRatio.fl) + Math.abs(t.slipRatio.fr)) / 2;
    const rr = (Math.abs(t.slipRatio.rl) + Math.abs(t.slipRatio.rr)) / 2;
    if (rr > fr * 1.3 && rr > 0.1) an.brakeRearLoose++;
    else if (fr > rr * 1.3 && fr > 0.1) an.brakeFrontLock++;
  }

  // Corner-exit longitudinal g: on throttle, still turning, accelerating. Slip
  // is allowed (the accelerometer reads the real achieved g); only drop impacts.
  if (!onSurface && d.g.combined < 3 && t.throttle > 0.5 && Math.abs(d.g.lat) > 0.3 && d.g.long > 0.05) {
    an.cornerExitAx.push(d.g.long);
  }

  // Front brake-dive: front travel vs braking g + speed (aero), clean & straight.
  // (Diagnostic only — NOT invertible to an absolute CG in FH6 because anti-dive
  // geometry carries braking load through the links, not the springs.) Include
  // real hard braking; only drop impact spikes.
  if (!onSurface && d.g.combined < 3 && Math.abs(d.g.lat) < 0.35 && t.speed > 5 && d.g.long < 0.05) {
    const brakeG = Math.max(0, -d.g.long);
    if (brakeG < 3) {
      an.cgBrakeG.push(brakeG);
      an.cgFrontTravel.push(((t.suspTravelM.fl + t.suspTravelM.fr) / 2) * M_TO_IN);
      an.cgSpeed.push(t.speed);
    }
  }

  // Damper velocities (in/s), off-kerb. Compression = bump stroke, extension =
  // rebound stroke. Full-droop (topping) counts feed the rebound-too-soft read.
  if (!onSurface && d.susp && d.susp.vel) {
    const fv = ((d.susp.vel.fl + d.susp.vel.fr) / 2) * M_TO_IN;
    const rv = ((d.susp.vel.rl + d.susp.vel.rr) / 2) * M_TO_IN;
    if (fv > 0.5) an.damperFrontComp.push(fv); else if (fv < -0.5) an.damperFrontExt.push(-fv);
    if (rv > 0.5) an.damperRearComp.push(rv); else if (rv < -0.5) an.damperRearExt.push(-rv);
    if (Math.min(t.normSusp.fl, t.normSusp.fr) < 0.03) an.topFront++;
    if (Math.min(t.normSusp.rl, t.normSusp.rr) < 0.03) an.topRear++;
    // Worst-wheel bump travel per end for ride-height (1.0 = bottoming).
    an.suspCompFront.push(Math.max(t.normSusp.fl, t.normSusp.fr));
    an.suspCompRear.push(Math.max(t.normSusp.rl, t.normSusp.rr));
  }

  // Braking entry speed: rising edge of a firm brake application (hysteresis:
  // arm at brake<0.15, fire at brake>0.4) — the speed at the top of the zone.
  if (t.brake > 0.4 && !an.prevBraking) {
    if (t.speed > 6) an.brakeEntrySpeeds.push(t.speed * MS_TO_MPH);
    an.prevBraking = true;
  } else if (t.brake < 0.15) {
    an.prevBraking = false;
  }

  // --- Standing-start acceleration (0-60, 0-100 mph), best of session ---
  // Anchor the clock whenever the car is essentially stopped and on throttle;
  // capture the elapsed time as speed first crosses each target.
  if (t.speed < MPH_TO_MS_0_4 && t.throttle > 0.3) {
    an.runT0 = ts; an.run60done = false; an.run100done = false;
  }
  if (an.runT0 != null && ts > an.runT0) {
    const el = (ts - an.runT0) / 1000;
    if (!an.run60done && t.speed >= MPH60) { an.run60done = true; if (el > 0.5) an.best0to60 = Math.min(an.best0to60, el); }
    if (!an.run100done && t.speed >= MPH100) { an.run100done = true; if (el > 0.5) an.best0to100 = Math.min(an.best0to100, el); }
  }

  // --- 60-0 braking (kinematic; no full stop needed) ---
  // Anchor at the 60 mph down-crossing under straight-line braking, then measure
  // the average decel of the 60→(lowest) segment from SPEED + DISTANCE (clean
  // channels, not the spiky accelerometer). Anchoring at 60 keeps it in the low-
  // aero regime, so extrapolating that decel to a full stop is a real 60-0.
  if (an.b60 == null) {
    if (t.brake > 0.35 && Math.abs(d.g.lat) < 0.4 && t.speed <= MPH60 && an.prevSpeed > MPH60) {
      an.b60 = { dist0: t.distanceTraveled, vEnd: t.speed, distEnd: t.distanceTraveled };
    }
  } else {
    const st = an.b60;
    const ended = t.throttle > 0.2 || t.brake < 0.15 || t.speed > st.vEnd + 0.5 || Math.abs(d.g.lat) > 0.6;
    if (!ended) {
      if (t.speed < st.vEnd) { st.vEnd = t.speed; st.distEnd = t.distanceTraveled; }
    } else {
      const dist = st.distEnd - st.dist0;              // meters covered 60→vEnd
      const shed = MPH60 - st.vEnd;                    // m/s shed below 60
      if (dist > 3 && shed >= 6.7) {                   // real event: ≥15 mph, straight
        const a = (MPH60 * MPH60 - st.vEnd * st.vEnd) / (2 * dist); // avg decel m/s²
        if (a > 2.94) {                                // sane (>0.3 g)
          const d60 = (MPH60 * MPH60) / (2 * a);       // full 60-0 distance at that decel
          if (d60 < an.best60to0Dist) { an.best60to0Dist = d60; an.best60to0Decel = a / 9.80665; }
        }
      }
      an.b60 = null;
    }
  }
  an.prevSpeed = t.speed;
}

// Build the final analytics object from the accumulator. `dyno` carries the
// powertrain scalars the recorder already computed (peak power band, redline…).
export function buildAnalytics(an, raceFrames, dyno = {}) {
  const n = an.latSigned.length;
  const latAbs = an.latSigned.map(Math.abs);

  const muLat = n ? round(percentile(latAbs, 0.95), 2) : null;
  const accel = an.longSigned.filter((x) => x > 0);
  const brake = an.longSigned.filter((x) => x < 0).map((x) => -x);
  const zeroTo60 = isFinite(an.best0to60) ? round(an.best0to60, 2) : null;
  const zeroTo100 = isFinite(an.best0to100) ? round(an.best0to100, 2) : null;
  const peakBrakeG = brake.length ? round(percentile(brake, 0.95), 2) : null;
  const launch = launchMetrics(an);
  const launchV = launchVerdictOf(launch, dyno);

  return {
    cleanFrames: n,
    raceFrames,
    discardedPct: raceFrames ? round((1 - n / raceFrames) * 100) : 0,

    muLat,
    muLat60: an.lat60.length >= 10 ? round(percentile(an.lat60, 0.95), 2) : null,
    peakAccelG: accel.length ? round(percentile(accel, 0.95), 2) : null,
    peakBrakeG,

    zeroTo60,
    zeroTo100,
    brake60to0Ft: isFinite(an.best60to0Dist) ? round(an.best60to0Dist * M_TO_FT, 1) : null,
    brake60to0DecelG: an.best60to0Decel > 0 ? round(an.best60to0Decel, 2) : null,
    cornerExitAxG: an.cornerExitAx.length >= 15 ? round(percentile(an.cornerExitAx, 0.9), 2) : null,
    cornerExitAxTypicalG: an.cornerExitAx.length >= 15 ? round(percentile(an.cornerExitAx, 0.5), 2) : null,
    cg: cgMeasure(an.cgBrakeG, an.cgFrontTravel, an.cgSpeed),
    avgBrakeEntryMph: an.brakeEntrySpeeds.length
      ? round(an.brakeEntrySpeeds.reduce((x, y) => x + y, 0) / an.brakeEntrySpeeds.length)
      : null,
    brakeEntryZones: an.brakeEntrySpeeds.length,
    damping: buildDamping(an, raceFrames),
    rideHeight: buildRideHeight(an),
    tires: buildTireTemps(an),
    aeroBalance: buildAeroBalance(an),
    // Launch signals. accelG (median longitudinal g off the line) is the real
    // quality metric; wastedSpinPct (high slip WITHOUT acceleration) is the only
    // honest "traction-limited" flag. slipPct is a robust smoothed-median reference,
    // NOT a trigger — Forza's slip ratio reads high even for a gripping launch.
    launchSlipPct: launch ? launch.slipPct : null,
    launchAccelG: launch ? launch.accelG : null,
    launchPeakAccelG: launch ? launch.peakAccelG : null,
    launchRealSpinPct: launch ? launch.realSpinPct : null,
    launchSamples: launch ? launch.samples : null,
    launchRpm: launch ? launch.rpm : null,
    launchRpmFracPct: launchV ? launchV.rpmFracPct : null,
    launchVerdict: launchV ? launchV.verdict : null,
    launchChangePct: launchV ? launchV.changePct : null,
    tractionCrossoverMph: crossoverMph(an),

    aero: aeroFit(an.speed, latAbs),
    balance: balanceAtLimit(latAbs, an.slipFront, an.slipRear, muLat),
    rollGradient: gradient(an.latSigned, an.roll),
    pitchGradient: gradient(an.longSigned, an.pitch),

    cdA: an.cdaSpeed > 0 ? {
      value: round((2 * an.cdaPower) / (RHO * an.cdaSpeed ** 3), 3),
      atSpeedMph: round(an.cdaSpeed * MS_TO_MPH),
      powerHp: round(an.cdaPower / 745.7),
    } : null,

    rollingRadiusFrontIn: an.rrCount ? round((an.rrFront / an.rrCount) * M_TO_IN, 1) : null,
    rollingRadiusRearIn: an.rrCount ? round((an.rrRear / an.rrCount) * M_TO_IN, 1) : null,

    diff: {
      accelSlipFrontPct: an.accelSlipF.length ? round(percentile(an.accelSlipF, 0.95) * 100) : null,
      accelSlipRearPct: an.accelSlipR.length ? round(percentile(an.accelSlipR, 0.95) * 100) : null,
      // MEDIAN, not p95. Braking slip is a heavy-tailed distribution — the top 5% of
      // frames are downshift blips, direction changes and low-speed noise, not sustained
      // lockup. Judging pressure on p95 made "past lockup" fire at EVERY pressure from
      // 157 down to 33 (measured over 24 runs), a one-way ratchet that walked brake
      // pressure to the floor. The median describes what the axle is actually doing for
      // most of the braking event, which is what the threshold bands were calibrated for.
      brakeSlipFrontPct: an.brakeSlipF.length ? round(percentile(an.brakeSlipF, 0.5) * 100) : null,
      brakeSlipRearPct: an.brakeSlipR.length ? round(percentile(an.brakeSlipR, 0.5) * 100) : null,
      // p95 kept for display/context only — never for the pressure decision.
      brakeSlipFrontPeakPct: an.brakeSlipF.length ? round(percentile(an.brakeSlipF, 0.95) * 100) : null,
      brakeSlipRearPeakPct: an.brakeSlipR.length ? round(percentile(an.brakeSlipR, 0.95) * 100) : null,
    },

    dyno: {
      peakHp: dyno.peakHp ?? null,
      peakHpRpm: dyno.peakHpRpm ?? null,
      peakTorque: dyno.peakTorque ?? null,
      peakTorqueRpm: dyno.peakTorqueRpm ?? null,
      powerBandWidthRpm: powerBandWidth(dyno.powerBand),
      redlineRpm: dyno.redlineRpm ?? null,
      avgShiftRpm: dyno.avgShiftRpm ?? null,
      autoShiftRpm: dyno.autoShiftRpm ?? null,
      autoShiftPctRedline: dyno.autoShiftPctRedline ?? null,
      shiftPerGear: dyno.shiftPerGear ?? [],
    },

    gearing: gearingAdvice(dyno, maxOf(an.speed), an.wotSpeed),

    powertrain: powertrainDiagnostics(an, muLat, zeroTo60, zeroTo100, dyno),
    handling: buildHandling(an),
  };
}

// Handling balance: over/understeer split by corner phase, rear-slide (spin)
// events and where they happen, and braking stability. The client attaches the
// phase-specific tuning fix.
function buildHandling(an) {
  const cf = an.cornerFrames;
  if (cf < 50) return null;
  const sum = (b) => b.os + b.us + b.n;
  const phase = (b) => ({ os: b.os, us: b.us, osPct: round((b.os / Math.max(1, sum(b))) * 100), usPct: round((b.us / Math.max(1, sum(b))) * 100) });
  const entry = phase(an.balEntry), mid = phase(an.balMid), exit = phase(an.balExit);

  const totalOS = an.balEntry.os + an.balMid.os + an.balExit.os;
  const totalUS = an.balEntry.us + an.balMid.us + an.balExit.us;
  const overall = totalOS > totalUS * 1.5 ? 'oversteer' : totalUS > totalOS * 1.5 ? 'understeer' : 'neutral';

  const rank = (pick) => [['entry', an.balEntry[pick]], ['mid', an.balMid[pick]], ['exit', an.balExit[pick]]]
    .sort((a, b) => b[1] - a[1]);
  const osRank = rank('os'), usRank = rank('us');
  const dominantOversteerPhase = osRank[0][1] > 0 ? osRank[0][0] : null;
  const dominantUndersteerPhase = usRank[0][1] > 0 ? usRank[0][0] : null;

  const sc = an.slideCause;
  const causeRank = [['trailBrake', sc.trailBrake], ['power', sc.power], ['grip', sc.grip]]
    .sort((a, b) => b[1] - a[1]);
  const slideDominantCause = an.slideEvents > 0 ? causeRank[0][0] : null;
  const dcSpeeds = slideDominantCause ? an.slideCauseSpeeds[slideDominantCause] : [];
  const slideMedianMph = dcSpeeds.length ? Math.round(percentile(dcSpeeds, 0.5)) : null;

  const brakeStability = an.brakeFrames >= 30
    ? (an.brakeRearLoose > an.brakeFrames * 0.15 ? 'rear-loose'
      : an.brakeFrontLock > an.brakeFrames * 0.15 ? 'front-lock' : 'stable')
    : null;

  return {
    cornerFrames: cf,
    overall, oversteerFrames: totalOS, understeerFrames: totalUS,
    entry, mid, exit,
    dominantOversteerPhase, dominantUndersteerPhase,
    slideEvents: an.slideEvents,
    slideCause: { trailBrake: sc.trailBrake, power: sc.power, grip: sc.grip },
    // Length-normalized slide rates (events per 1000 cornering frames). Raw counts
    // scale with how long you drove, so a longer stint reads as a bigger problem;
    // the run-over-run diff advice keys off these rates instead so it converges.
    slideCausePer1k: {
      trailBrake: round((sc.trailBrake / cf) * 1000, 1),
      power: round((sc.power / cf) * 1000, 1),
      grip: round((sc.grip / cf) * 1000, 1),
    },
    slideDominantCause, slideMedianMph,
    brakeStability,
  };
}

// 3-frame rolling median — kills single-frame slip-ratio spikes (which the raw
// channel is full of at low speed) while keeping the real trend.
function median3(arr) {
  return arr.map((_, i) => percentile(arr.slice(Math.max(0, i - 1), i + 2), 0.5));
}

// Launch quality from the in-order launch zone. Longitudinal g is the reliable
// read; the raw slip channel is frame-to-frame noise (±100%). realSpinPct is the
// noise-robust spin measure: a 5-frame-median slip above 1.5 (wheels turning >2.5×
// ground speed) sustained — genuine, heavy wheelspin, not a stray spike.
function launchMetrics(an) {
  const slip = an.launchZoneSlip, g = an.launchZoneG, rpm = an.launchZoneRpm;
  if (slip.length < 8) return null;
  const sm5 = slip.map((_, i) => percentile(slip.slice(Math.max(0, i - 2), i + 3), 0.5));
  const realSpin = sm5.filter((x) => x > 1.5).length / sm5.length;
  return {
    samples: slip.length,
    slipPct: round(percentile(median3(slip), 0.5) * 100),
    accelG: round(percentile(g, 0.5), 2),
    peakAccelG: round(percentile(g, 0.95), 2),
    realSpinPct: round(realSpin * 100),
    rpm: rpm.length ? Math.round(percentile(rpm, 0.5)) : null, // median engine rpm off the line
  };
}

// Classify the launch, with a WIDE dead band so it doesn't oscillate. The sweet
// spot is the launch grip limit: g plateaus and the tires just break loose (some
// real spin). Being there is NOT a problem to fix. Only the extremes are:
//  • traction-limited (1st too SHORT): heavy sustained spin (realSpin ≥ 45%) is
//    wasting grip → nudge TALLER.
//  • under-geared / bogging (1st too TALL): the launch is genuinely WEAK (low g) AND
//    the engine is stuck low in its power band AND the wheels aren't breaking loose
//    → make SHORTER. The low-g gate is essential: a torquey engine can pull huge g
//    at low rpm, and "low rpm" alone is NOT bogging. Judging by rpm without checking
//    g caused a runaway (it told a 1.45 g launch to keep shortening until top speed
//    collapsed). If the car already launches hard, gearing 1st shorter won't help.
//  • optimal: everything else — at/near the grip limit, OR already launching strong.
// peakHpRpm is the stable reference (peakTorqueRpm swings run-to-run on short drag
// runs); a sub-6000 value means the dyno never sampled the top end → treat as unknown.
const WEAK_LAUNCH_G = 0.9; // below this the launch is genuinely soft; above it it's strong
function launchVerdictOf(launch, dyno) {
  if (!launch) return null;
  const peakHpRpm = dyno.peakHpRpm && dyno.peakHpRpm > 6000 ? dyno.peakHpRpm : null;
  const rpmFrac = launch.rpm != null && peakHpRpm ? launch.rpm / peakHpRpm : null;
  const spin = launch.realSpinPct;
  let verdict, changePct = 0; // signed: − taller, + shorter
  if (spin >= 45) {
    verdict = 'traction-limited';
    changePct = -Math.min(12, Math.max(3, Math.round((spin - 45) / 4) + 3));
  } else if (spin <= 8 && launch.accelG < WEAK_LAUNCH_G && rpmFrac != null && rpmFrac < 0.6) {
    verdict = 'under-geared';
    changePct = Math.min(30, Math.max(5, Math.round((0.8 * peakHpRpm / launch.rpm - 1) * 100)));
  } else {
    verdict = 'optimal'; // at the grip limit, or already launching strong
  }
  return { verdict, changePct, rpmFracPct: rpmFrac != null ? round(rpmFrac * 100) : null };
}

// Measured powertrain/gearing diagnostics: top-end character (from 0-60 vs
// 0-100), traction crossover vs corner speed, and launch quality. All from
// telemetry — no car-weight model needed (that stays in the spreadsheet).
// Traction crossover (mph): highest speed at which full-throttle frames are
// still MOSTLY spinning (≥40% of that 5-mph bin). Above it, spin is rare =
// power-limited. Bin fractions ignore stray high-speed slip spikes.
function crossoverMph(an) {
  let crossoverBin = -1;
  for (const key of Object.keys(an.wotBinTotal)) {
    const bin = Number(key);
    const total = an.wotBinTotal[bin];
    const spin = an.wotBinSpin[bin] || 0;
    if (total >= 8 && spin / total >= 0.4) crossoverBin = Math.max(crossoverBin, bin);
  }
  return crossoverBin >= 0 ? (crossoverBin + 1) * 5 : null;
}

function powertrainDiagnostics(an, muLat, zeroTo60, zeroTo100, dyno = {}) {
  const out = [];

  // Top-end character — does the car keep pulling past 60? (mirrors sheet B110)
  if (zeroTo60 && zeroTo100) {
    const ratio = zeroTo100 / zeroTo60;
    const r = 100 / 60;
    if (ratio >= r * r) {
      out.push({ level: 'warn', title: 'Runs out of pull after 60 mph', text: `0–100 takes ${ratio.toFixed(2)}× your 0–60 — the drop-off past 60 meets or beats a pure power-limited car. This is a TOP-END / drag limit, not launch: add power or cut drag, and leave launch tuning alone.` });
    } else if (ratio <= (r + r * r) / 2) {
      out.push({ level: 'info', title: 'Strong top end', text: `Keeps pulling hard past 60 mph (0–100 only ${ratio.toFixed(2)}× the 0–60). Nothing to fix up top. Want more launch punch and don't need top speed? Shorten the gearing.` });
    } else {
      out.push({ level: 'info', title: 'Balanced pull 0–100', text: `Even acceleration from 0–100 mph (${ratio.toFixed(2)}× ratio). Nothing to adjust.` });
    }
  }

  const crossover = crossoverMph(an);
  let cornerMph = null;
  if (muLat) {
    const lim = 0.6 * muLat;
    const cs = [];
    for (let i = 0; i < an.latSigned.length; i++) if (Math.abs(an.latSigned[i]) > lim) cs.push(an.speed[i]);
    if (cs.length >= 20) cornerMph = Math.round(percentile(cs, 0.5) * MS_TO_MPH);
  }
  if (crossover == null) {
    out.push({ level: 'info', title: 'Power-limited everywhere', text: `Full throttle almost never breaks traction this session — grip isn't the limit. Extra power turns into speed here, not wheelspin.` });
  } else if (cornerMph != null && crossover > cornerMph + 8) {
    out.push({ level: 'warn', title: `Traction crossover ~${crossover} mph — above your corner speeds`, text: `Below ~${crossover} mph you're GRIP-limited (extra power just spins); above it, POWER-limited (extra power = speed). Your hard corners sit around ${cornerMph} mph — below crossover — so on corner exit you're carrying power the grip and weight can't use. More grip, less weight, wider/stickier rear tires, or taller low gears help more than power here.` });
  } else {
    out.push({ level: 'info', title: `Traction crossover ~${crossover} mph`, text: `Grip-limited below ~${crossover} mph, power-limited above.${cornerMph != null ? ` Your corner speeds (~${cornerMph} mph) are at or above crossover, so power is usable on exit.` : ''}` });
  }

  // Launch quality: judged by acceleration + noise-robust spin, with a wide dead
  // band (see launchVerdictOf) so it doesn't oscillate around the grip limit.
  const launch = launchMetrics(an);
  const lv = launchVerdictOf(launch, dyno);
  if (launch && lv) {
    if (lv.verdict === 'traction-limited') {
      out.push({ level: 'warn', title: 'Launch is traction-limited — 1st slightly too short', text: `${launch.realSpinPct}% of the launch is the tires spinning hard (only ${launch.accelG} g). Nudge 1st TALLER ~${Math.abs(lv.changePct)}% to put more of it down.` });
    } else if (lv.verdict === 'under-geared') {
      out.push({ level: 'warn', title: 'Launch is under-geared — 1st too tall', text: `The launch pulls only ${launch.accelG} g and the engine lugs at ~${launch.rpm} rpm (${lv.rpmFracPct}% of its ${dyno.peakHpRpm} rpm power peak) without the tires breaking loose — 1st is too tall. Make 1st SHORTER ~${lv.changePct}% to rev into the power band; the g should climb.` });
    } else {
      out.push({ level: 'info', title: 'Launch is at the grip limit — 1st is about right', text: `Pulls ${launch.accelG} g (peak ${launch.peakAccelG} g) with the tires just breaking loose (${launch.realSpinPct}% real spin) — that's the launch traction limit. Neither shorter nor taller will gain much; this is the sweet spot.` });
    }
  }

  // Gearing gaps: after a WOT upshift you should land back in the power band.
  // If the landing RPM falls below peak torque, that gear gap is too tall (bogs).
  if (Array.isArray(dyno.shiftPerGear) && dyno.peakTorqueRpm) {
    const tall = dyno.shiftPerGear.filter((g) => g.landing != null && g.landing < dyno.peakTorqueRpm);
    if (tall.length) {
      const worst = tall.reduce((x, y) => (y.landing < x.landing ? y : x));
      out.push({ level: 'warn', title: `Gear ${worst.gear}→${worst.gear + 1} gap too tall`, text: `After shifting you fall to ~${worst.landing} rpm — below peak torque (${dyno.peakTorqueRpm} rpm), so the car bogs coming out. Shorten this gear (or the final drive) to land above peak torque.${tall.length > 1 ? ` ${tall.length} gears do this.` : ''}` });
    } else if (dyno.shiftPerGear.some((g) => g.landing != null)) {
      out.push({ level: 'info', title: 'Gearing gaps look good', text: `Every measured upshift lands above peak torque (${dyno.peakTorqueRpm} rpm) — the engine stays in the power band between gears.` });
    }
  }

  // Power deployment: share of full-throttle time the grip couldn't hold the
  // power (single over-upgrade score across the whole run).
  let wotTotal = 0, wotSpin = 0;
  for (const k of Object.keys(an.wotBinTotal)) { wotTotal += an.wotBinTotal[k]; wotSpin += an.wotBinSpin[k] || 0; }
  if (wotTotal >= 50) {
    const pct = Math.round((wotSpin / wotTotal) * 100);
    if (pct < 5) {
      out.push({ level: 'info', title: 'Power fully deployable', text: `Only ${pct}% of your full-throttle time breaks traction — nearly all the power reaches the road. Grip is well-matched to power.` });
    } else if (pct <= 20) {
      out.push({ level: 'info', title: `~${pct}% of power lost to wheelspin`, text: `${pct}% of full-throttle time is spent spinning — mild, and could be aggressive throttle as much as tune. Smooth inputs first; if it persists, small grip/diff gains help.` });
    } else {
      out.push({ level: 'warn', title: `Over-powered: ${pct}% of full throttle is wheelspin`, text: `${pct}% of your full-throttle time is wasted to wheelspin — the car makes more power than the grip and weight can put down. Grip, weight loss, wider/stickier tires, or a looser accel diff will gain more than more power.` });
    }
  }

  return out;
}

// CG-height measurement: regress front suspension travel (in) against braking g.
// The slope = front compression per g; combined with the driver's weight, wheel-
// base and fitted front spring rate it inverts to h_cg. r2 flags confidence — a
// clean hard straight-line stop gives a good fit; scrappy braking does not.
// Damping indicators from damper velocities (reference-free, directional — not a
// stiffness calc). Rebound resists extension, so extension÷compression velocity:
// high = rebound too soft, very low = too stiff/packing. RMS front vs rear = the
// transient work balance. Topping (full droop) hints rebound too soft / droop.
function buildDamping(an, raceFrames) {
  const fc = an.damperFrontComp, fe = an.damperFrontExt, rc = an.damperRearComp, re = an.damperRearExt;
  const n = fc.length + fe.length + rc.length + re.length;
  if (n < 200) return null; // not enough suspension activity to read
  const p95 = (a) => (a.length ? round(percentile(a, 0.95), 1) : 0);
  const rms = (...arrs) => {
    const all = [].concat(...arrs);
    return all.length ? round(Math.sqrt(all.reduce((s, v) => s + v * v, 0) / all.length), 2) : 0;
  };
  const fBump = p95(fc), fReb = p95(fe), rBump = p95(rc), rReb = p95(re);
  const rmsF = rms(fc, fe), rmsR = rms(rc, re);
  // THRESHOLD SIZED TO MEASURED NOISE. At 1.2 this verdict was a coin flip: across a real
  // 50-run history the front/rear damper-work ratio at a FIXED damper setting averaged
  // 1.17-1.28 with sd 0.08-0.22, so 1.2 sat only 0.3-0.4 sd from the mean and the verdict
  // flipped between 'front-busy' and 'balanced' at EVERY setting tested (47%/53% at one).
  // 1.45 puts the boundary ~2 sd out, so a call means a real, repeatable imbalance.
  const DAMPER_IMBALANCE = 1.45;
  const balance = rmsF > rmsR * DAMPER_IMBALANCE ? 'front-busy' : rmsR > rmsF * DAMPER_IMBALANCE ? 'rear-busy' : 'balanced';
  const rebound = (bump, reb) => (bump <= 0 ? null : reb / bump > 1.05 ? 'soft' : reb / bump < 0.55 ? 'stiff' : 'ok');
  const pct = (c) => round((c / Math.max(1, raceFrames)) * 100, 1);
  return {
    fBump, fReb, rBump, rReb, rmsF, rmsR, balance,
    frontRebound: rebound(fBump, fReb),
    rearRebound: rebound(rBump, rReb),
    toppingFrontPct: pct(an.topFront),
    toppingRearPct: pct(an.topRear),
    samples: n,
  };
}

// Aero balance from speed-banded cornering balance. Downforce grows with speed², so
// aero shows up as the balance SHIFTING between low- and high-speed corners. loBal /
// hiBal = mean angleBalance (rear slip − front slip; <0 understeer, >0 oversteer).
// The client only recommends an aero change for a genuinely speed-dependent shift —
// a car that's uniformly understeery (mechanical) gets no aero advice.
function buildAeroBalance(an) {
  if (an.aeroLoN < 30 || an.aeroHiN < 30) return null;
  const lo = an.aeroLoSum / an.aeroLoN;
  const hi = an.aeroHiSum / an.aeroHiN;
  return {
    loBal: round(lo, 3),
    hiBal: round(hi, 3),
    shift: round(hi - lo, 3), // >0 = looser (more oversteer) at speed; <0 = more understeer at speed
    loN: an.aeroLoN,
    hiN: an.aeroHiN,
  };
}

// Tire temperatures, as information only (FH6-26). FH6-27 measured that pressure moves
// neither temperature nor grip, on tarmac or dirt, so nothing here drives a setting.
// The old block averaged only frames at or above 140 °F: null on every dirt run (they
// never get there), and on tarmac a reading that called the tires cold every run.
//   - Water frames (puddle > 0) are left out: a crossing cools the tires ~45 °F.
//   - The median covers the last two-thirds of the run; the opening third is warm-up.
//   - FH6 sends one rear temperature for both rear wheels (every car checked so far);
//     rearShared says when this run did.
export function freshTireTemps() {
  return { tireFront: [], tireRear: [], tireRearShared: 0 };
}

export function addTireTemps(acc, t) {
  if (!t || !t.isRaceOn || !t.tireTempF) return;
  const p = t.puddle;
  if (p && Math.max(p.fl, p.fr, p.rl, p.rr) > 0) return;
  const T = t.tireTempF;
  acc.tireFront.push((T.fl + T.fr) / 2);
  acc.tireRear.push((T.rl + T.rr) / 2);
  if (T.rl === T.rr) acc.tireRearShared++;
}

// qi-trace: work-item="FH6-26" acceptance-criteria="AC-2" risk-tier="medium" test-coverage="tests/unit/tire-temps.test.ts"
export function buildTireTemps(acc) {
  const n = acc.tireFront.length;
  if (n < 50) return null;
  const late = Math.floor(n / 3);
  return {
    frontTempF: round(percentile(acc.tireFront.slice(late), 0.5), 1),
    rearTempF: round(percentile(acc.tireRear.slice(late), 0.5), 1),
    frontPeakF: round(maxOf(acc.tireFront), 1),
    rearPeakF: round(maxOf(acc.tireRear), 1),
    rearShared: acc.tireRearShared === n,
    samples: n,
  };
}

// The same block rebuilt from a recording's lines, for runs saved before FH6-26.
export function tireTempsFromLines(lines) {
  const acc = freshTireTemps();
  for (const line of lines) {
    if (!line) continue;
    let frame;
    try { frame = JSON.parse(line); } catch { continue; }
    if (frame && frame.t) addTireTemps(acc, frame.t);
  }
  return buildTireTemps(acc);
}

// Ride-height calibration from bump-travel usage per end. peakComp (p99 of worst-
// wheel normalized travel, 1.0 = bottoming) says how close the biggest bumps came to
// the stops; bottomPct is how often it actually bottomed. Near 1.0 → RAISE; well
// below → headroom to LOWER for a lower CG / more downforce. p99 (not max) drops the
// odd impact spike that survives the kerb filter.
function buildRideHeight(an) {
  const f = an.suspCompFront, r = an.suspCompRear;
  if (f.length < 200) return null; // not enough clean suspension activity
  const bot = (arr) => round((arr.filter((x) => x >= 0.97).length / arr.length) * 100, 1);
  return {
    frontPeakComp: round(percentile(f, 0.99), 2),
    rearPeakComp: round(percentile(r, 0.99), 2),
    frontBottomPct: bot(f),
    rearBottomPct: bot(r),
    samples: f.length,
  };
}

function cgMeasure(brakeG, travel, speed) {
  const n = brakeG.length;
  if (n < 25) return null;
  // Multiple regression: travel = a + b·brakeG + c·(v²/1000). b is the
  // weight-transfer compression per g with aero (the v² term) removed.
  let sx1 = 0, sx2 = 0, sy = 0, sx1x1 = 0, sx2x2 = 0, sx1x2 = 0, sx1y = 0, sx2y = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const x1 = brakeG[i], x2 = (speed[i] * speed[i]) / 1000, y = travel[i];
    sx1 += x1; sx2 += x2; sy += y;
    sx1x1 += x1 * x1; sx2x2 += x2 * x2; sx1x2 += x1 * x2;
    sx1y += x1 * y; sx2y += x2 * y; syy += y * y;
  }
  const coef = solve3([[n, sx1, sx2], [sx1, sx1x1, sx1x2], [sx2, sx1x2, sx2x2]], [sy, sx1y, sx2y]);
  if (!coef) return null; // singular (e.g. no speed spread → can't separate aero)
  const [a, b, c] = coef;
  let ssr = 0;
  for (let i = 0; i < n; i++) { const p = a + b * brakeG[i] + c * (speed[i] * speed[i]) / 1000; ssr += (travel[i] - p) ** 2; }
  const sst = syy - (sy * sy) / n;
  const r2 = sst > 0 ? Math.max(0, 1 - ssr / sst) : 0;
  const brakeGRef = round(percentile(brakeG, 0.9), 2);
  const perG = round(b, 3);
  return {
    frontTravelPerGIn: perG,
    frontTravelChangeIn: round(perG * brakeGRef, 3),
    brakeGRef,
    r2: round(r2, 2),
    samples: n,
    reliable: r2 >= 0.4 && brakeGRef >= 0.5 && perG > 0,
  };
}

// Solve a 3×3 linear system M·x = V by Gaussian elimination with partial pivot.
function solve3(M, V) {
  const m = M.map((row, i) => [...row, V[i]]);
  for (let col = 0; col < 3; col++) {
    let piv = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
    if (Math.abs(m[piv][col]) < 1e-12) return null;
    [m[col], m[piv]] = [m[piv], m[col]];
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      for (let k = col; k < 4; k++) m[r][k] -= f * m[col][k];
    }
  }
  return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
}

// Grip vs speed: bin by speed, take the grip envelope (p90 |lat g|) per bin,
// then regress envelope against v². Intercept = mechanical grip; the v² slope is
// the aero (downforce) contribution — extra g of grip gained by 100 mph.
function aeroFit(speed, latAbs) {
  if (speed.length < 50) return null;
  const binW = 5; // m/s
  const bins = new Map();
  for (let i = 0; i < speed.length; i++) {
    const b = Math.floor(speed[i] / binW);
    if (!bins.has(b)) bins.set(b, []);
    bins.get(b).push(latAbs[i]);
  }
  const xs = [], ys = [];
  for (const [b, arr] of bins) {
    if (arr.length < 15) continue;
    const vc = (b + 0.5) * binW;
    xs.push(vc * vc);
    ys.push(percentile(arr, 0.9));
  }
  if (xs.length < 3) return null;
  const reg = linregress(xs, ys);
  if (!reg) return null;
  return {
    muMech: round(reg.intercept, 2),
    aeroGainPer100mph: round(reg.slope * V100 * V100, 2),
    r2: round(reg.r2, 2),
    speedBins: xs.length,
  };
}

// Mechanical balance: front vs rear slip-angle (normalized, ~1.0 = limit) while
// cornering near the grip limit. Front > rear = understeer.
function balanceAtLimit(latAbs, slipFront, slipRear, muLat) {
  if (!muLat) return null;
  const lim = 0.85 * muLat;
  let sf = 0, sr = 0, c = 0;
  for (let i = 0; i < latAbs.length; i++) {
    if (latAbs[i] >= lim) { sf += slipFront[i]; sr += slipRear[i]; c++; }
  }
  if (c < 10) return null;
  const front = sf / c, rear = sr / c, delta = front - rear;
  const verdict =
    Math.abs(delta) < 0.05 ? 'neutral' :
    delta > 0 ? `understeer +${round(delta, 2)}` : `oversteer +${round(-delta, 2)}`;
  return { frontSlip: round(front, 2), rearSlip: round(rear, 2), deltaSlip: round(delta, 2), verdict };
}

// Chassis gradient: slope of an angle (radians) vs a g value, in degrees per g.
function gradient(gArr, angleRad) {
  const reg = linregress(gArr, angleRad);
  if (!reg) return null;
  return round(Math.abs(reg.slope) * RAD_TO_DEG, 2);
}

// Gear-ratio spacing from telemetry. Physics: at a shift, road speed is constant, so
// engine RPM ∝ gear ratio; the landing RPM after an upshift = shiftRPM × (ratio_next /
// ratio_this). Even landing RPM every shift ⟺ a constant step ratio ⟺ a GEOMETRIC
// progression of the gear ratios — which is exactly the smooth "arc" the in-game gear
// graph shows. So the whole box is coordinated at once: hold 1st (launch) and top gear
// (top speed) as the driver's anchors, then geometrically space every gear in between.
// (The CLIENT does that math from the ratios the driver enters — the packet has no
// ratio values.) Here we supply the context: gear count, the flat-out shift RPM, and
// the usable power-band edge, plus the MEASURED landings as a diagnostic overlay.
function gearingAdvice(dyno, topSpeedMs, wotSpeed) {
  const pb = dyno.powerBand;
  const spg = dyno.shiftPerGear;
  const numGears = dyno.numGears || 0;
  if (!Array.isArray(pb) || pb.length < 4 || numGears < 3) return null;
  const peakHp = Math.max(...pb.map((p) => p.hp));
  if (peakHp <= 0) return null;
  const loRpm = pb[0].rpm;
  const hiRpm = pb[pb.length - 1].rpm;
  const peakRpm = dyno.peakHpRpm && dyno.peakHpRpm >= loRpm && dyno.peakHpRpm <= hiRpm
    ? dyno.peakHpRpm
    : pb.reduce((a, p) => (p.hp > a.hp ? p : a)).rpm;
  const hpAt = (rpm) => {
    if (rpm <= loRpm) return pb[0].hp;
    if (rpm >= hiRpm) return pb[pb.length - 1].hp;
    for (let i = 1; i < pb.length; i++) {
      if (pb[i].rpm >= rpm) {
        const a = pb[i - 1], b = pb[i];
        return a.hp + ((rpm - a.rpm) / (b.rpm - a.rpm)) * (b.hp - a.hp);
      }
    }
    return pb[pb.length - 1].hp;
  };
  // Bottom edge of the usable power band = lowest rpm still making ≥90% of peak power.
  // If an even shift lands below this, the box is too spread for its gear count (bogs).
  const within = pb.filter((p) => p.hp >= 0.9 * peakHp).map((p) => p.rpm);
  const powerBandLoRpm = within.length ? Math.min(...within) : Math.round(peakRpm * 0.7);
  // Flat-out shift point (auto-shift median ≈ where the game shifts; else redline).
  const shiftRpm = dyno.autoShiftRpm || dyno.redlineRpm || peakRpm;

  // MEASURED landings, diagnostic overlay only (which gears currently bog on the road).
  const clean = (spg || []).filter((g) => g.landing != null && g.landing > 0 && g.rpm > 0 && g.landing <= 0.9 * g.rpm);
  const measured = clean.map((g) => ({
    gear: g.gear + 1, fromGear: g.gear, shiftRpm: g.rpm, landingRpm: g.landing,
    landingHpPct: round((hpAt(g.landing) / peakHp) * 100),
  }));

  // Final-drive signal: peak RPM reached in TOP gear on the straight vs the ACTUAL rev
  // ceiling (what the engine really hits — the reported redline can read high), and how
  // much of that time is spent pinned at the limiter.
  const tg = dyno.topGearStats;
  const revCeiling = dyno.revLimit || dyno.redlineRpm || peakRpm;
  const finalDrive = tg && tg.n >= 20 && revCeiling > 0
    ? {
        topGear: numGears,
        topGearMaxRpm: Math.round(tg.maxRpm),
        topGearRpmPct: round((tg.maxRpm / revCeiling) * 100),
        limiterPct: round((tg.lim / tg.n) * 100),
        redlineRpm: Math.round(revCeiling), // the ACTUAL rev limit
        samples: tg.n,
      }
    : null;

  return {
    numGears,
    shiftRpm,
    peakHpRpm: peakRpm,
    peakTorqueRpm: dyno.peakTorqueRpm ?? null,
    powerBandLoRpm,
    measured,
    finalDrive,
    // The measured dyno + the speed it was making, shipped so the CLIENT can simulate
    // candidate gear sets against this car's real power curve rather than assuming a
    // shape. Together with finalDrive.topGearMaxRpm these give road speed per rpm
    // directly off the telemetry, so the solver needs no final-drive or tyre-radius
    // input from the driver.
    powerBand: pb,
    topSpeedMs: topSpeedMs > 0 ? round(topSpeedMs, 2) : null,
    // Full-throttle-and-gaining frames per speed bin — the weighting for the
    // final-drive solve. Sent raw; the client decides what to do with it.
    wotSpeedHist: Array.isArray(wotSpeed) && wotSpeed.some((x) => x > 0)
      ? { binMs: WOT_BIN_MS, counts: wotSpeed }
      : null,
  };
}

function powerBandWidth(powerBand) {
  if (!Array.isArray(powerBand) || powerBand.length < 2) return null;
  const peak = Math.max(...powerBand.map((p) => p.hp));
  if (peak <= 0) return null;
  const within = powerBand.filter((p) => p.hp >= 0.9 * peak).map((p) => p.rpm);
  if (within.length < 2) return null;
  return Math.max(...within) - Math.min(...within);
}

function linregress(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; syy += ys[i] * ys[i];
  }
  const den = n * sxx - sx * sx;
  if (den === 0) return null;
  const slope = (n * sxy - sx * sy) / den;
  const intercept = (sy - slope * sx) / n;
  const rDen = Math.sqrt(den * (n * syy - sy * sy));
  const r = rDen === 0 ? 0 : (n * sxy - sx * sy) / rDen;
  return { slope, intercept, r2: r * r };
}

// Max of a numeric array without spreading it into apply() — these arrays run to tens
// of thousands of samples and Math.max(...arr) blows the call stack at that size.
function maxOf(arr) {
  let m = 0;
  if (!arr) return 0;
  for (let i = 0; i < arr.length; i++) if (arr[i] > m) m = arr[i];
  return m;
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))];
}

function round(x, d = 0) {
  const m = 10 ** d;
  return Math.round(x * m) / m;
}
