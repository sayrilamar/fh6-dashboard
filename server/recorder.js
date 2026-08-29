// Session recorder: streams frames to JSONL on disk while recording, and keeps
// in-memory aggregates that become a post-session "tuning report" (power band
// for gearing, peak power/torque RPM, max grip, lap times, thermal trends).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TIRE } from './metrics.js';
import { freshAnalytics, addAnalyticsFrame, buildAnalytics } from './analytics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSIONS_DIR = path.join(__dirname, '..', 'sessions');

fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const RPM_BIN = 250; // rpm bucket size for the power band curve
const LEVEL_RANK = { crit: 3, warn: 2, info: 1 };
const worseLevel = (a, b) => (LEVEL_RANK[b] > LEVEL_RANK[a] ? b : a);
// Peak grip is reported as the 99th-percentile G, not the raw max. The raw max
// is dominated by kerb-strike/collision accelerometer spikes (impacts, not
// grip); p99 is the sustained limit a tuner actually cares about.
const P_GRIP = 0.99;

export class Recorder {
  constructor({ autoRecover = true } = {}) {
    this.active = false;
    this.armed = false;          // record pressed, waiting for a real car to spawn
    this.pendingCarName = null;  // user-typed name, applied when recording begins
    this.session = null;
    this.stream = null;
    this.prev = { speedMs: null, ts: 0, gear: null, rpm: 0, throttle: 0 };
    // A recording interrupted by a crash/restart leaves a .jsonl with no
    // .summary.json. Rebuild those summaries on boot so no run is lost.
    if (autoRecover) this.recoverOrphans();
  }

  // Arm the recorder. Actual capture (and the session's car identity) is deferred
  // to the first frame with a real, spawned car — so pressing RECORD on a race
  // grid (which reports a "#0 / FWD / 0cyl" placeholder until the green light)
  // still captures the launch AND the correct drivetrain. Free roam (car already
  // valid) begins on the very next frame.
  start(meta = {}) {
    if (this.active) this.stop();
    this.armed = true;
    this.pendingCarName = (meta.carName || '').trim() || undefined;
    // Tune the driver confirmed BEFORE this run. Recording it up front (instead of
    // inferring it afterwards) is what makes (settings → outcome) pairs trustworthy,
    // which is what the adaptive step size is computed from.
    this.pendingTune = meta.tune && typeof meta.tune === 'object' ? meta.tune : null;
    // Channels the driver flagged as at their in-game limit (car-specific ranges).
    this.pendingLimits = meta.limits && typeof meta.limits === 'object' ? meta.limits : null;
    return this.status();
  }

  _begin(meta) {
    const id = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(SESSIONS_DIR, `${id}.jsonl`);
    this.session = { id, file, startedAt: Date.now(), frames: 0, meta, agg: freshAgg() };
    this.stream = fs.createWriteStream(file, { flags: 'a' });
    // Header record so a rebuilt-from-jsonl summary keeps the tune. Frame loops skip
    // any line without .t/.d, so this is safe to prepend.
    if (meta.tune || meta.limits) this.stream.write(JSON.stringify({ type: 'session-meta', tune: meta.tune, limits: meta.limits }) + '\n');
    this.active = true;
    this.armed = false;
    this.prev = { speedMs: null, ts: 0, gear: null, rpm: 0, throttle: 0 };
  }

  add(frame) {
    if (this.armed) {
      const t = frame.t;
      // A spawned car reports a non-zero ordinal; the placeholder is 0. Wait for
      // that + the sim running, then take the identity from the telemetry itself.
      if (!t.isRaceOn || !(t.carOrdinal > 0)) return;
      this._begin({
        carName: this.pendingCarName,
        carOrdinal: t.carOrdinal, carClass: t.carClass, carPI: t.carPI,
        drivetrain: t.drivetrain, numCylinders: t.numCylinders,
        tune: this.pendingTune || undefined,
        limits: this.pendingLimits || undefined,
      });
    }
    if (!this.active || !this.session) return;
    if (!frame.t.isRaceOn) return;

    this.stream.write(JSON.stringify(frame) + '\n');
    this.session.frames++;
    this.prev = applyFrame(this.session.agg, frame, this.prev);
  }

  stop() {
    this.armed = false;
    this.pendingCarName = null;
    if (!this.active || !this.session) return null;
    this.active = false;
    if (this.stream) this.stream.end();
    const summary = this.buildSummary();
    fs.writeFileSync(
      path.join(SESSIONS_DIR, `${this.session.id}.summary.json`),
      JSON.stringify(summary, null, 2)
    );
    this.session = null;
    this.stream = null;
    return summary;
  }

  buildSummary() {
    return summarize(this.session, Date.now());
  }

  // Rebuild summaries for any .jsonl that has no matching .summary.json — i.e.
  // a recording that was cut off by a crash or restart before stop() ran.
  recoverOrphans() {
    let files;
    try { files = fs.readdirSync(SESSIONS_DIR); } catch { return []; }
    const have = new Set(files.filter((f) => f.endsWith('.summary.json')));
    const recovered = [];
    for (const jf of files.filter((f) => f.endsWith('.jsonl'))) {
      const id = jf.slice(0, -'.jsonl'.length);
      if (have.has(`${id}.summary.json`)) continue;
      try {
        if (this.rebuildFromJsonl(id)) recovered.push(id);
      } catch (e) {
        console.error(`[recorder] could not recover ${id}: ${e.message}`);
      }
    }
    if (recovered.length) {
      console.log(`[recorder] recovered ${recovered.length} interrupted session(s): ${recovered.join(', ')}`);
    }
    return recovered;
  }

  rebuildFromJsonl(id) {
    const file = path.join(SESSIONS_DIR, `${safeId(id)}.jsonl`);
    if (!fs.existsSync(file)) return null;
    const agg = freshAgg();
    let prev = { speedMs: null, ts: 0, gear: null, rpm: 0, throttle: 0 };
    let frames = 0;
    let startedAt = null;
    let lastTs = null;
    let meta = {};
    let tune = null;
    let limits = null;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line) continue;
      let frame;
      try { frame = JSON.parse(line); } catch { continue; }
      // Header record written at capture time — carries the pre-run tune.
      if (frame && frame.type === 'session-meta') { if (frame.tune) tune = frame.tune; if (frame.limits) limits = frame.limits; continue; }
      if (!frame || !frame.t || !frame.d) continue;
      if (startedAt == null) {
        startedAt = frame.ts;
        const t = frame.t;
        // The game never sends a car name, but the frame carries the numeric
        // identity — preserve it so a recovered session is still identifiable.
        meta = {
          carOrdinal: t.carOrdinal, carClass: t.carClass, carPI: t.carPI,
          drivetrain: t.drivetrain, numCylinders: t.numCylinders,
          ...(tune ? { tune } : {}),
          ...(limits ? { limits } : {}),
        };
      }
      prev = applyFrame(agg, frame, prev);
      lastTs = frame.ts;
      frames++;
    }
    if (!frames) { fs.rmSync(file); return null; } // empty/garbage capture
    const session = { id, startedAt: startedAt ?? Date.now(), frames, meta, agg };
    const summary = summarize(session, lastTs ?? startedAt ?? Date.now());
    summary.recovered = true;
    fs.writeFileSync(
      path.join(SESSIONS_DIR, `${id}.summary.json`),
      JSON.stringify(summary, null, 2)
    );
    return summary;
  }

  status() {
    if (this.armed) return { recording: false, armed: true };
    if (!this.active || !this.session) return { recording: false };
    return {
      recording: true,
      id: this.session.id,
      frames: this.session.frames,
      durationSec: round((Date.now() - this.session.startedAt) / 1000),
    };
  }

  list() {
    const files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith('.summary.json'));
    return files
      .map((f) => {
        try { return JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8')); }
        catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  getSummary(id) {
    const file = path.join(SESSIONS_DIR, `${safeId(id)}.summary.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  delete(id) {
    const base = safeId(id);
    if (!base) return false;
    let removed = false;
    for (const ext of ['.summary.json', '.jsonl']) {
      const file = path.join(SESSIONS_DIR, `${base}${ext}`);
      if (fs.existsSync(file)) { fs.rmSync(file); removed = true; }
    }
    return removed;
  }

  // Delete every recorded session (both .summary.json and .jsonl). Skips the run
  // currently being recorded so an in-progress capture isn't yanked out from under.
  deleteAll() {
    let count = 0;
    for (const f of fs.readdirSync(SESSIONS_DIR)) {
      if (!f.endsWith('.summary.json') && !f.endsWith('.jsonl')) continue;
      if (this.session && f.startsWith(this.session.id)) continue; // don't nuke the active recording
      try { fs.rmSync(path.join(SESSIONS_DIR, f)); count++; } catch { /* ignore */ }
    }
    return count;
  }
}

function freshAgg() {
  return {
    powerBand: new Map(), // rpmBin -> {hp, torque}
    peakHp: 0, peakHpRpm: 0,
    peakTorque: 0, peakTorqueRpm: 0,
    maxEngineRpm: 0,
    shiftRpms: [], // rpm captured at each upshift (any throttle)
    wotShifts: [], // { gear, rpm, landing } for wide-open-throttle upshifts (shift point + where it lands)
    pendingLanding: null, // in-progress landing-rpm measurement after a WOT upshift
    maxGear: 0, // highest forward gear seen — the box's gear count (top gear)
    // ACTUAL rev ceiling = highest rpm the engine reaches at WOT. The reported
    // engineMaxRpm can sit ABOVE the real limiter (e.g. reads 10000 but the engine
    // cuts at ~9770), so measure limiter time against what the engine actually hits.
    revLimit: 0,
    // Top-gear RPM usage on the straights, per gear: { maxRpm, lim (at-limiter frames), n }.
    topGearStats: {},
    issues: new Map(), // note code -> { count, level, msg }
    an: freshAnalytics(), // session engineering analytics (clean-frame stats)
    gLatSamples: [], gLongSamples: [], gCombinedSamples: [],
    maxSpeedKph: 0, sumSpeedKph: 0, speedSamples: 0,
    topTireC: { fl: 0, fr: 0, rl: 0, rr: 0 },
    peakSlipAngleFront: 0, peakSlipAngleRear: 0,
    maxWheelslip: 0,
    bottoming: { fl: false, fr: false, rl: false, rr: false },
    bottomingEvents: 0,
    tireWarmed: { fl: false, fr: false, rl: false, rr: false },
    fullThrottleFrames: 0,
    bestLap: Infinity,
    lapTimes: [],
    lastSeenLapNumber: -1,
    maxLapNumber: 0,
    // Point-to-point / sprint races (Rivals street races) never cross a start-finish
    // line, so bestLap/lastLap stay 0 — but currentRaceTime counts up to the finish.
    // Track it (and the distance at that time) so a sprint still has a comparable time.
    raceTimeSec: 0,
    finishDistanceM: 0,
    fuelStart: null, fuelEnd: null,
  };
}

// Fold one frame into the running aggregates. Pure given (agg, frame, prev);
// returns the new `prev` so live recording and jsonl replay share one path.
function applyFrame(a, frame, prev) {
  const { t, d } = frame;

  // Power band: record max hp/torque seen in each rpm bin (full-throttle-ish).
  if (t.currentRpm > 0 && t.throttle > 0.9) {
    const bin = Math.round(t.currentRpm / RPM_BIN) * RPM_BIN;
    const cur = a.powerBand.get(bin) || { hp: 0, torque: 0 };
    cur.hp = Math.max(cur.hp, d.powerHp);
    cur.torque = Math.max(cur.torque, d.torqueLbFt);
    a.powerBand.set(bin, cur);
  }
  if (d.powerHp > a.peakHp) { a.peakHp = d.powerHp; a.peakHpRpm = t.currentRpm; }
  if (d.torqueLbFt > a.peakTorque) { a.peakTorque = d.torqueLbFt; a.peakTorqueRpm = t.currentRpm; }

  // Redline (max engine rpm the game reports for this car).
  a.maxEngineRpm = Math.max(a.maxEngineRpm, t.engineMaxRpm);

  // Landing RPM: after a WOT upshift, RPM dips to a minimum then climbs. Track that
  // minimum over the next ~600ms. CRITICAL: only accept a landing from a CLEAN
  // window — one that ran its full length in-gear and where the RPM actually
  // bottomed and rebounded. If you short-shift to the next gear (or lift) before
  // the engine settles, the window is truncated and reads a near-zero drop; those
  // artifacts (a 4→5 "landing" 2% below the shift RPM) otherwise poison the
  // per-gear median and produce bogus ratio recommendations.
  if (a.pendingLanding) {
    const pl = a.pendingLanding;
    const shifted = t.gear !== pl.gearAt;   // interrupted by another gear change
    const lifted = t.throttle < 0.5;        // came off throttle before it settled
    const timedOut = frame.ts > pl.untilTs; // window ran to full length
    if (!shifted && !lifted && !timedOut) {
      if (t.currentRpm < pl.minRpm) pl.minRpm = t.currentRpm;
      else if (t.currentRpm > pl.minRpm + 100) pl.rebounded = true; // saw the true bottom
    } else {
      const drop = pl.minRpm / pl.rpm; // 1 = no drop; a real upshift step is ~0.7–0.85
      const clean = timedOut && !shifted && pl.rebounded && drop >= 0.55 && drop <= 0.9;
      if (clean) a.wotShifts.push({ gear: pl.gear, rpm: pl.rpm, landing: pl.minRpm });
      a.pendingLanding = null;
    }
  }

  // Highest forward gear reached = the box's top gear (gear count). Bound to sane
  // forward gears so reverse/neutral (0) and garbage don't inflate it.
  if (t.gear >= 1 && t.gear <= 10 && t.speed > 5) a.maxGear = Math.max(a.maxGear, t.gear);

  // Actual rev ceiling the engine reaches at WOT (the real limiter, not the reported
  // redline). Reliably captured because top gear can't upshift, so it revs to the cut.
  if (t.throttle > 0.9) a.revLimit = Math.max(a.revLimit, t.currentRpm);

  // Top-gear RPM usage: flat-out, roughly straight, at speed — the "end of the straight"
  // sample for final-drive advice. "At the limiter" = within ~1.5% of the ACTUAL rev
  // ceiling (established early once you first rev one out), not the reported redline.
  if (t.throttle > 0.9 && t.gear >= 1 && t.gear <= 10 && t.speed > 20 && Math.abs(d.g.lat) < 0.3) {
    const e = a.topGearStats[t.gear] || (a.topGearStats[t.gear] = { maxRpm: 0, lim: 0, n: 0 });
    e.maxRpm = Math.max(e.maxRpm, t.currentRpm);
    e.n++;
    if (a.revLimit > 0 && t.currentRpm >= 0.985 * a.revLimit) e.lim++;
  }

  // Shift points: on each upshift, the rpm in the frame BEFORE the gear changed
  // is where the driver actually shifted. (Ignore downshifts and N/R.)
  if (prev.gear != null && prev.gear >= 1 && t.gear > prev.gear && prev.rpm > 0) {
    a.shiftRpms.push(prev.rpm);
    // Wide-open-throttle upshifts define the car's true (auto) shift point;
    // part-throttle lift-shifts happen much lower and would drag the number down.
    if (prev.throttle > 0.9) {
      a.pendingLanding = { gear: prev.gear, rpm: prev.rpm, minRpm: t.currentRpm, gearAt: t.gear, untilTs: frame.ts + 600, rebounded: false };
    }
  }

  // Grip/brake forces: keep raw samples so the summary reports a robust
  // high-percentile peak. A naive max captures kerb-strike / collision
  // accelerometer spikes (5-7g over a frame or two) that are impacts, not
  // tire grip — physically impossible for a road car to sustain.
  a.gLatSamples.push(Math.abs(d.g.lat));
  a.gLongSamples.push(d.g.long);
  a.gCombinedSamples.push(d.g.combined);

  // Top speed: ignore teleport/reset/rewind glitch frames. A real car can't
  // change speed faster than ~5g; anything beyond that is a discontinuity, so
  // don't let it pollute the recorded peak.
  const dtMs = prev.ts ? frame.ts - prev.ts : 0;
  const accelOk =
    prev.speedMs == null ||
    dtMs <= 0 ||
    Math.abs(t.speed - prev.speedMs) / (dtMs / 1000) < 50; // m/s^2
  if (accelOk) {
    a.maxSpeedKph = Math.max(a.maxSpeedKph, d.speedKph);
    a.sumSpeedKph += d.speedKph;
    a.speedSamples++;
  }

  a.topTireC.fl = Math.max(a.topTireC.fl, t.tireTempC.fl);
  a.topTireC.fr = Math.max(a.topTireC.fr, t.tireTempC.fr);
  a.topTireC.rl = Math.max(a.topTireC.rl, t.tireTempC.rl);
  a.topTireC.rr = Math.max(a.topTireC.rr, t.tireTempC.rr);

  // Balance: peak slip angle front/rear over the stint (over/understeer trend).
  a.peakSlipAngleFront = Math.max(a.peakSlipAngleFront, d.balance.frontSlipAngle);
  a.peakSlipAngleRear = Math.max(a.peakSlipAngleRear, d.balance.rearSlipAngle);

  // Traction: worst driven-wheel slip (wheelspin/lockup severity).
  a.maxWheelslip = Math.max(a.maxWheelslip, d.driven.drivenSlip);

  // Bottoming-out events: count rising edges per corner (with hysteresis).
  for (const c of ['fl', 'fr', 'rl', 'rr']) {
    const v = t.normSusp[c];
    if (v > 0.97 && !a.bottoming[c]) { a.bottomingEvents++; a.bottoming[c] = true; }
    else if (v < 0.9) a.bottoming[c] = false;
  }

  if (t.throttle > 0.95) a.fullThrottleFrames++;

  // Lap times: capture completed laps as the lap counter increments.
  if (t.lapNumber > a.lastSeenLapNumber) {
    if (a.lastSeenLapNumber >= 0 && t.lastLap > 0) a.lapTimes.push(t.lastLap);
    a.lastSeenLapNumber = t.lapNumber;
  }
  a.maxLapNumber = Math.max(a.maxLapNumber, t.lapNumber);

  // Fuel burn (fraction 0..1 of tank).
  if (a.fuelStart == null) a.fuelStart = t.fuel;
  a.fuelEnd = t.fuel;

  if (t.bestLap > 0 && t.bestLap < a.bestLap) a.bestLap = t.bestLap;

  // Sprint/point-to-point finish time: currentRaceTime rises monotonically to the
  // finish, so its max ≈ the race result even with no lap crossing.
  if (t.currentRaceTime > a.raceTimeSec) {
    a.raceTimeSec = t.currentRaceTime;
    a.finishDistanceM = t.distanceTraveled;
  }

  // Session engineering analytics (clean-frame grip/aero/balance/dyno/CdA…).
  addAnalyticsFrame(a.an, t, d, frame.ts);

  // A tire is "warmed" once it first reaches the cold threshold; cold flags
  // before that are just opening-lap warm-up, not a tune problem.
  for (const c of ['fl', 'fr', 'rl', 'rr']) {
    if (t.tireTempF[c] >= TIRE.cold) a.tireWarmed[c] = true;
  }

  // Tally how long each Race Engineer issue was active (frames per note code).
  if (Array.isArray(frame.notes)) {
    for (const n of frame.notes) {
      if (!n.code) continue;
      // Suppress warm-up cold flags: only count tire-cold-X after corner X warmed.
      const cold = /^tire-cold-(FL|FR|RL|RR)$/.exec(n.code);
      if (cold && !a.tireWarmed[cold[1].toLowerCase()]) continue;
      const cur = a.issues.get(n.code) || { count: 0, level: n.level, msg: n.msg };
      cur.count++;
      cur.msg = n.msg; // keep the most recent (worst) phrasing/value
      cur.level = worseLevel(cur.level, n.level);
      a.issues.set(n.code, cur);
    }
  }

  return { speedMs: t.speed, ts: frame.ts, gear: t.gear, rpm: t.currentRpm, throttle: t.throttle };
}

function summarize(s, endedAt) {
  const a = s.agg;
  const powerBand = [...a.powerBand.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([rpm, v]) => ({ rpm, hp: round(v.hp), torque: round(v.torque) }));

  const lapsCompleted = a.lapTimes.length;
  const avgLap = lapsCompleted ? a.lapTimes.reduce((x, y) => x + y, 0) / lapsCompleted : null;
  const lapConsistency = avgLap != null && a.bestLap !== Infinity ? avgLap - a.bestLap : null;
  const avgSpeedKph = a.speedSamples ? a.sumSpeedKph / a.speedSamples : 0;
  const fuelUsedPct =
    a.fuelStart != null && a.fuelEnd != null ? Math.max(0, a.fuelStart - a.fuelEnd) * 100 : null;
  const fuelPerLapPct = fuelUsedPct != null && lapsCompleted > 0 ? fuelUsedPct / lapsCompleted : null;
  const fullThrottlePct = s.frames ? (a.fullThrottleFrames / s.frames) * 100 : 0;
  const avgShiftRpm = a.shiftRpms.length
    ? a.shiftRpms.reduce((x, y) => x + y, 0) / a.shiftRpms.length
    : null;

  // Auto-shift point: the median RPM of wide-open-throttle upshifts is the RPM
  // the game shifts this car at when you're flat out (works in automatic too).
  const redlineRpm = round(a.maxEngineRpm);
  const wotRpms = a.wotShifts.map((w) => w.rpm);
  const autoShiftRpm = wotRpms.length ? Math.round(percentile(wotRpms, 0.5)) : null;
  const byGear = new Map();
  for (const w of a.wotShifts) {
    if (!byGear.has(w.gear)) byGear.set(w.gear, { rpms: [], landings: [] });
    const e = byGear.get(w.gear);
    e.rpms.push(w.rpm);
    if (w.landing > 0) e.landings.push(w.landing);
  }
  const shiftPerGear = [...byGear.entries()]
    .filter(([, e]) => e.rpms.length >= 2) // ignore one-off / lift shifts
    .sort((x, y) => x[0] - y[0])
    .map(([gear, e]) => ({
      gear,
      rpm: Math.round(percentile(e.rpms, 0.5)),
      landing: e.landings.length ? Math.round(percentile(e.landings, 0.5)) : null,
    }));

  const analytics = buildAnalytics(a.an, s.frames, {
    peakHp: round(a.peakHp),
    peakHpRpm: round(a.peakHpRpm),
    peakTorque: round(a.peakTorque),
    peakTorqueRpm: round(a.peakTorqueRpm),
    powerBand,
    redlineRpm,
    avgShiftRpm: avgShiftRpm != null ? round(avgShiftRpm) : null,
    autoShiftRpm,
    autoShiftPctRedline: autoShiftRpm != null && redlineRpm ? Math.round((autoShiftRpm / redlineRpm) * 100) : null,
    shiftPerGear,
    numGears: a.maxGear || null,
    topGearStats: a.topGearStats[a.maxGear] || null,
    revLimit: a.revLimit || null,
  });

  // Post-race issues: collapse per-corner codes (tire-cold-FL, …) into one
  // family entry listing the affected corners, then rank by severity and how
  // much of the stint each was active. The client attaches a prescriptive fix
  // keyed by the family code.
  const families = new Map(); // family -> { level, count, corners:Set, msg }
  for (const [code, v] of a.issues) {
    const m = code.match(/^(.*)-(FL|FR|RL|RR)$/);
    const family = m ? m[1] : code;
    const corner = m ? m[2] : null;
    const fam = families.get(family) || { level: 'info', count: 0, corners: new Set(), msg: v.msg };
    if (corner) fam.corners.add(corner);
    if (v.count >= fam.count) { fam.count = v.count; fam.msg = v.msg; } // representative = worst corner
    fam.level = worseLevel(fam.level, v.level);
    families.set(family, fam);
  }
  const issues = [...families.entries()]
    .sort((x, y) => LEVEL_RANK[y[1].level] - LEVEL_RANK[x[1].level] || y[1].count - x[1].count)
    .slice(0, 6)
    .map(([code, v]) => ({
      code,
      level: v.level,
      corners: [...v.corners].sort(),
      pctStint: round((v.count / (s.frames || 1)) * 100),
      msg: v.msg,
    }));

  return {
    id: s.id,
    startedAt: s.startedAt,
    endedAt,
    durationSec: round((endedAt - s.startedAt) / 1000),
    frames: s.frames,
    meta: s.meta,
    peakHp: round(a.peakHp),
    peakHpRpm: round(a.peakHpRpm),
    peakTorque: round(a.peakTorque),
    peakTorqueRpm: round(a.peakTorqueRpm),
    redlineRpm: round(a.maxEngineRpm),
    avgShiftRpm: avgShiftRpm != null ? round(avgShiftRpm) : null,
    shiftCount: a.shiftRpms.length,
    issues,
    maxGLat: round(percentile(a.gLatSamples, P_GRIP), 2),
    maxAccelG: round(percentile(a.gLongSamples.map((x) => Math.max(0, x)), P_GRIP), 2),
    maxBrakeG: round(percentile(a.gLongSamples.map((x) => Math.max(0, -x)), P_GRIP), 2),
    maxCombinedG: round(percentile(a.gCombinedSamples, P_GRIP), 2),
    maxSpeedKph: round(a.maxSpeedKph),
    avgSpeedKph: round(avgSpeedKph),
    topTireC: {
      fl: round(a.topTireC.fl), fr: round(a.topTireC.fr),
      rl: round(a.topTireC.rl), rr: round(a.topTireC.rr),
    },
    peakSlipAngleFront: round(a.peakSlipAngleFront, 1),
    peakSlipAngleRear: round(a.peakSlipAngleRear, 1),
    maxWheelslipPct: round(a.maxWheelslip * 100),
    bottomingEvents: a.bottomingEvents,
    fullThrottlePct: round(fullThrottlePct),
    lapsCompleted,
    avgLapSec: avgLap != null ? round(avgLap, 3) : null,
    lapConsistencySec: lapConsistency != null ? round(lapConsistency, 3) : null,
    fuelUsedPct: fuelUsedPct != null ? round(fuelUsedPct, 1) : null,
    fuelPerLapPct: fuelPerLapPct != null ? round(fuelPerLapPct, 1) : null,
    bestLap: a.bestLap === Infinity ? null : round(a.bestLap, 3),
    // Sprint finish time (only meaningful when there's no lap; ~5 s min filters warmup/aborted runs).
    raceTimeSec: a.raceTimeSec >= 5 ? round(a.raceTimeSec, 3) : null,
    finishDistanceM: a.finishDistanceM >= 5 ? round(a.finishDistanceM) : null,
    powerBand,
    analytics,
  };
}

function round(n, d = 0) {
  const m = 10 ** d;
  return Math.round(n * m) / m;
}

// Robust peak: the p-th percentile of a sample set, ignoring the extreme tail
// (impact spikes). p in [0,1].
function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))];
}

function safeId(id) {
  return String(id).replace(/[^a-zA-Z0-9._-]/g, '');
}

export { SESSIONS_DIR };
