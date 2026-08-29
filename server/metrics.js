// Derived race-engineer metrics computed server-side from a parsed frame.
// Kept unit-aware and tuning-focused: gearing (power band), grip (traction
// circle), balance (slip-angle delta = understeer/oversteer), tire thermals,
// suspension travel/damping.

const G = 9.80665;
const W_TO_HP = 1 / 745.6998715822702;
const W_TO_KW = 1 / 1000;
const NM_TO_LBFT = 0.7375621211696;
const MS_TO_KPH = 3.6;
const MS_TO_MPH = 2.2369362920544;

// FH6 tire temp grip window (Fahrenheit). Calibrated from live FH6 data: an
// A-class car sits ~143-152F even under ~1.35G cornering, so the window is set
// wide to avoid false "cold" flags while still catching real overheating.
// Adjust to match your car's in-game tire-temp HUD green zone if needed.
export const TIRE = { cold: 140, ideal: 175, hot: 230, critical: 265 };

const avg = (...xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const absAvg = (...xs) => avg(...xs.map(Math.abs));

export function deriveFrame(t, prev, dtSec) {
  const speedMs = t.speed;
  const powerHp = t.power * W_TO_HP;

  const gLat = t.accel.x / G; // +right
  const gLong = t.accel.z / G; // +forward (accel), -forward (braking)
  const gVert = t.accel.y / G;
  const gCombined = Math.hypot(gLat, gLong);

  // Balance: average tire slip ANGLE magnitude, front vs rear.
  // angleBalance > 0 => rear slipping more (oversteer), < 0 => understeer.
  const frontSlipAngle = absAvg(t.slipAngle.fl, t.slipAngle.fr);
  const rearSlipAngle = absAvg(t.slipAngle.rl, t.slipAngle.rr);
  const angleBalance = rearSlipAngle - frontSlipAngle;

  // Grip usage: combined slip ~1.0 is the limit of adhesion.
  const gripUsage = {
    fl: t.combinedSlip.fl,
    fr: t.combinedSlip.fr,
    rl: t.combinedSlip.rl,
    rr: t.combinedSlip.rr,
    max: Math.max(t.combinedSlip.fl, t.combinedSlip.fr, t.combinedSlip.rl, t.combinedSlip.rr),
  };

  // Suspension: normalized travel (1 = bottoming). L/R and F/R balance.
  const frontTravel = avg(t.normSusp.fl, t.normSusp.fr);
  const rearTravel = avg(t.normSusp.rl, t.normSusp.rr);

  // Suspension velocity (m/s) for damping analysis.
  let suspVel = { fl: 0, fr: 0, rl: 0, rr: 0 };
  if (prev && dtSec > 0) {
    suspVel = {
      fl: (t.suspTravelM.fl - prev.suspTravelM.fl) / dtSec,
      fr: (t.suspTravelM.fr - prev.suspTravelM.fr) / dtSec,
      rl: (t.suspTravelM.rl - prev.suspTravelM.rl) / dtSec,
      rr: (t.suspTravelM.rr - prev.suspTravelM.rr) / dtSec,
    };
  }

  // Wheelspin/lockup detection from slip ratio (>~0.15 = losing grip).
  const driven = drivenWheelSlip(t);

  const rpmFrac = t.engineMaxRpm > 0 ? t.currentRpm / t.engineMaxRpm : 0;

  return {
    speedKph: speedMs * MS_TO_KPH,
    speedMph: speedMs * MS_TO_MPH,
    powerHp,
    powerKw: t.power * W_TO_KW,
    torqueLbFt: t.torque * NM_TO_LBFT,
    torqueNm: t.torque,
    g: { lat: gLat, long: gLong, vert: gVert, combined: gCombined },
    balance: { frontSlipAngle, rearSlipAngle, angleBalance },
    gripUsage,
    susp: { frontTravel, rearTravel, vel: suspVel },
    driven,
    rpmFrac,
    boostPsi: t.boost, // FH reports boost in PSI
  };
}

function drivenWheelSlip(t) {
  const front = avg(Math.abs(t.slipRatio.fl), Math.abs(t.slipRatio.fr));
  const rear = avg(Math.abs(t.slipRatio.rl), Math.abs(t.slipRatio.rr));
  let drivenSlip;
  if (t.drivetrain === 'FWD') drivenSlip = front;
  else if (t.drivetrain === 'RWD') drivenSlip = rear;
  else drivenSlip = avg(front, rear);
  return { front, rear, drivenSlip, wheelspin: drivenSlip > 0.15 };
}

// Live engineer notes: short, actionable, instantaneous heuristics.
export function engineerNotes(t, d) {
  const notes = [];
  if (!t.isRaceOn) return notes;

  // Tire thermals
  const temps = t.tireTempF;
  const corners = [
    ['FL', temps.fl],
    ['FR', temps.fr],
    ['RL', temps.rl],
    ['RR', temps.rr],
  ];
  for (const [name, f] of corners) {
    if (f > TIRE.critical) notes.push({ level: 'crit', code: `tire-crit-${name}`, msg: `${name} tire overheating (${f.toFixed(0)}F) — lower pressure / reduce camber / soften that end.` });
    else if (f > TIRE.hot) notes.push({ level: 'warn', code: `tire-hot-${name}`, msg: `${name} tire hot (${f.toFixed(0)}F) — past ideal grip window.` });
    else if (f < TIRE.cold) notes.push({ level: 'info', code: `tire-cold-${name}`, msg: `${name} tire cold (${f.toFixed(0)}F) — raise pressure or it carries little load.` });
  }

  // F/R and L/R thermal balance
  const frontT = avg(temps.fl, temps.fr);
  const rearT = avg(temps.rl, temps.rr);
  if (Math.abs(frontT - rearT) > 22) {
    notes.push({
      level: 'info',
      code: 'thermal-fr',
      msg: frontT > rearT
        ? `Fronts ${(frontT - rearT).toFixed(0)}F hotter than rears — fronts doing more work (understeer bias).`
        : `Rears ${(rearT - frontT).toFixed(0)}F hotter than fronts — rears doing more work (oversteer bias).`,
    });
  }

  // Bottoming out
  for (const [name, v] of [['FL', t.normSusp.fl], ['FR', t.normSusp.fr], ['RL', t.normSusp.rl], ['RR', t.normSusp.rr]]) {
    if (v > 0.97) notes.push({ level: 'warn', code: `bottom-${name}`, msg: `${name} suspension bottoming out — raise ride height or stiffen springs/bump.` });
  }

  // Balance (only meaningful with some lateral load)
  if (Math.abs(d.g.lat) > 0.4) {
    if (d.balance.angleBalance > 2.5) notes.push({ level: 'warn', code: 'oversteer', msg: `Oversteer: rear slip angle ${d.balance.angleBalance.toFixed(1)}deg > front — soften rear ARB/springs or add rear toe-in.` });
    else if (d.balance.angleBalance < -2.5) notes.push({ level: 'warn', code: 'understeer', msg: `Understeer: front slip angle ${(-d.balance.angleBalance).toFixed(1)}deg > rear — soften front ARB/springs or reduce front toe.` });
  }

  // Wheelspin / lockup
  if (d.driven.wheelspin && t.throttle > 0.5) {
    const fp = (d.driven.front * 100).toFixed(0);
    const rp = (d.driven.rear * 100).toFixed(0);
    const axle =
      d.driven.front > d.driven.rear * 1.2 ? 'Front' :
      d.driven.rear > d.driven.front * 1.2 ? 'Rear' : 'All-wheel';
    notes.push({ level: 'warn', code: 'wheelspin', msg: `${axle} wheelspin under power (front ${fp}% / rear ${rp}% slip).` });
  }

  return notes.slice(0, 8);
}

export const CONST = { G, W_TO_HP, NM_TO_LBFT, MS_TO_KPH, MS_TO_MPH };
