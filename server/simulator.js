// Telemetry simulator: generates plausible FH6 "Data Out" packets and sends
// them to the dashboard's UDP port, so the whole pipeline can be exercised
// without an Xbox. Run: `npm run sim` (while the server is running).

import dgram from 'node:dgram';
import { OFFSETS as O } from './parser.js';

const PORT = Number(process.env.UDP_PORT || 5300);
const HOST = process.env.SIM_HOST || '127.0.0.1';
const HZ = 60;

const sock = dgram.createSocket('udp4');
const cToF = (c) => (c * 9) / 5 + 32;

// Persistent sim state
let st = {
  time: 0,
  rpm: 1200,
  gear: 2,
  tire: { fl: 40, fr: 40, rl: 40, rr: 40 }, // Celsius
  distance: 0,
  lap: 1,
  lapTime: 0,
  bestLap: 0,
  lastLap: 0,
};

const ENGINE_MAX_RPM = 7800;
const ENGINE_IDLE_RPM = 900;
const GEAR_RATIOS = [0, 3.2, 2.3, 1.7, 1.3, 1.0, 0.82]; // index by gear
const FINAL_DRIVE = 3.1;

function powerCurve(rpm) {
  // Torque (Nm) bell curve peaking ~4800 rpm, power rises to ~7000 rpm.
  const x = rpm / ENGINE_MAX_RPM;
  const torque = 480 * Math.exp(-Math.pow((rpm - 4800) / 2600, 2)) + 120;
  const power = (torque * rpm) / 9548.8 * 1000; // Nm*rpm -> W
  return { torque, power, x };
}

function step(dt) {
  st.time += dt;
  st.lapTime += dt;

  // Track: lap of ~70s. Build a corner/straight profile.
  const lapPhase = (st.time % 70) / 70; // 0..1
  // Throttle/brake program around the lap
  let throttle, brake, steer;
  if (lapPhase < 0.35) { throttle = 1; brake = 0; steer = 0; }       // main straight
  else if (lapPhase < 0.45) { throttle = 0; brake = 0.9; steer = 0.2; } // braking zone
  else if (lapPhase < 0.62) { throttle = 0.55; brake = 0; steer = 0.85; } // long corner
  else if (lapPhase < 0.72) { throttle = 1; brake = 0; steer = 0.2; }  // short chute
  else if (lapPhase < 0.82) { throttle = 0.3; brake = 0.5; steer = -0.9; } // hairpin
  else { throttle = 1; brake = 0; steer = -0.1; }                     // exit onto straight

  steer += Math.sin(st.time * 0.7) * 0.05; // small corrections

  // Speed from a simple longitudinal model
  const { torque, power } = powerCurve(st.rpm);
  const accel = throttle * 9 - brake * 18 - 1.5; // m/s^2 (drag/rolling baked in)
  st.speed = Math.max(8, (st.speed || 20) + accel * dt);
  st.speed = Math.min(st.speed, 92);

  // RPM from speed and gear; auto shift. (speed/2m circumference) * ratios * 60s
  const engineRpm = (g) => st.speed * 30 * GEAR_RATIOS[g] * FINAL_DRIVE;
  if (engineRpm(st.gear) > 7200 && st.gear < 6) st.gear++;
  else if (engineRpm(st.gear) < 2400 && st.gear > 1) st.gear--;
  st.rpm = Math.min(ENGINE_MAX_RPM, Math.max(ENGINE_IDLE_RPM, engineRpm(st.gear)));

  st.distance += st.speed * dt;

  // Lap timing
  if (lapPhase < dt / 70 && st.time > 5) {
    st.lastLap = st.lapTime;
    if (st.bestLap === 0 || st.lapTime < st.bestLap) st.bestLap = st.lapTime;
    st.lapTime = 0;
    st.lap++;
  }

  // Lateral G from steering and speed -> slip angles (slight oversteer bias)
  const gLat = steer * (st.speed / 92) * 1.6; // up to ~1.6 G
  const gLong = accel / 9.80665;
  const frontSlip = Math.abs(steer) * 4;
  const rearSlip = Math.abs(steer) * 4.8 + (throttle > 0.6 ? 1.2 : 0); // power oversteer
  const slipSign = Math.sign(steer || 1);

  // Tire heating: warm toward a target driven by load & slip, cool slowly
  const baseTarget = 70 + Math.abs(gLat) * 22;
  const heat = (cur, extra) => cur + ((baseTarget + extra - cur)) * Math.min(1, dt * 0.25);
  st.tire.fl = heat(st.tire.fl, gLat < 0 ? 14 : 4 + frontSlip);
  st.tire.fr = heat(st.tire.fr, gLat > 0 ? 14 : 4 + frontSlip);
  st.tire.rl = heat(st.tire.rl, (gLat < 0 ? 10 : 2) + rearSlip * 2);
  st.tire.rr = heat(st.tire.rr, (gLat > 0 ? 10 : 2) + rearSlip * 2);

  // Suspension load transfer -> normalized travel (0.5 neutral)
  const ns = (latLoad, longLoad) => Math.max(0, Math.min(1, 0.5 + latLoad + longLoad));
  const norm = {
    fl: ns(-gLat * 0.12, -gLong * 0.1),
    fr: ns(gLat * 0.12, -gLong * 0.1),
    rl: ns(-gLat * 0.12, gLong * 0.1),
    rr: ns(gLat * 0.12, gLong * 0.1),
  };

  return { throttle, brake, steer, torque, power, gLat, gLong, frontSlip, rearSlip, slipSign, norm };
}

function buildPacket(s) {
  const buf = Buffer.alloc(O.tireWearFL + 16, 0);
  const wf = (off, v) => buf.writeFloatLE(v, off);

  buf.writeInt32LE(1, O.isRaceOn);
  buf.writeUInt32LE(Math.floor(st.time * 1000) >>> 0, O.timestampMs);
  wf(O.engineMaxRpm, ENGINE_MAX_RPM);
  wf(O.engineIdleRpm, ENGINE_IDLE_RPM);
  wf(O.currentRpm, st.rpm);

  wf(O.accelX, s.gLat * 9.80665);
  wf(O.accelY, 0.2);
  wf(O.accelZ, s.gLong * 9.80665);
  wf(O.velX, s.gLat * 2);
  wf(O.velZ, st.speed);

  wf(O.yaw, Math.sin(st.time * 0.1) * 3);
  wf(O.pitch, s.gLong * 0.05);
  wf(O.roll, -s.gLat * 0.04);

  wf(O.normSuspFL, s.norm.fl); wf(O.normSuspFR, s.norm.fr);
  wf(O.normSuspRL, s.norm.rl); wf(O.normSuspRR, s.norm.rr);

  const sr = s.throttle > 0.6 ? 0.08 + Math.random() * 0.12 : 0.02;
  wf(O.slipRatioRL, sr); wf(O.slipRatioRR, sr);
  wf(O.slipRatioFL, 0.02); wf(O.slipRatioFR, 0.02);

  // slip angles (degrees), sign by steering direction
  wf(O.slipAngleFL, s.frontSlip * s.slipSign);
  wf(O.slipAngleFR, s.frontSlip * s.slipSign);
  wf(O.slipAngleRL, s.rearSlip * s.slipSign);
  wf(O.slipAngleRR, s.rearSlip * s.slipSign);

  const cs = Math.min(1.2, Math.abs(s.gLat) * 0.6 + sr * 2);
  wf(O.combinedSlipFL, cs); wf(O.combinedSlipFR, cs);
  wf(O.combinedSlipRL, cs * 1.05); wf(O.combinedSlipRR, cs * 1.05);

  // suspension travel meters (around 0.08m mid)
  wf(O.suspTravelMFL, s.norm.fl * 0.16); wf(O.suspTravelMFR, s.norm.fr * 0.16);
  wf(O.suspTravelMRL, s.norm.rl * 0.16); wf(O.suspTravelMRR, s.norm.rr * 0.16);

  buf.writeInt32LE(2523123456 | 0, O.carOrdinal);
  buf.writeInt32LE(5, O.carClass); // S1-ish
  buf.writeInt32LE(823, O.carPI);
  buf.writeInt32LE(1, O.drivetrainType); // RWD
  buf.writeInt32LE(8, O.numCylinders);

  // dash block
  const ang = (st.distance / 220) % (Math.PI * 2);
  wf(O.positionX, Math.cos(ang) * 400 + Math.sin(st.time * 0.05) * 30);
  wf(O.positionY, 50);
  wf(O.positionZ, Math.sin(ang) * 250);
  wf(O.speed, st.speed);
  wf(O.power, s.power);
  wf(O.torque, s.torque);

  wf(O.tireTempFL, cToF(st.tire.fl)); wf(O.tireTempFR, cToF(st.tire.fr));
  wf(O.tireTempRL, cToF(st.tire.rl)); wf(O.tireTempRR, cToF(st.tire.rr));

  wf(O.boost, Math.max(0, (st.rpm / ENGINE_MAX_RPM) * 14 * s.throttle));
  wf(O.fuel, Math.max(0, 1 - st.distance / 80000));
  wf(O.distanceTraveled, st.distance);
  wf(O.bestLap, st.bestLap);
  wf(O.lastLap, st.lastLap);
  wf(O.currentLap, st.lapTime);
  wf(O.currentRaceTime, st.time);

  buf.writeUInt16LE(st.lap, O.lapNumber);
  buf.writeUInt8(1, O.racePosition);
  buf.writeUInt8(Math.round(s.throttle * 255), O.throttle);
  buf.writeUInt8(Math.round(s.brake * 255), O.brake);
  buf.writeUInt8(0, O.clutch);
  buf.writeUInt8(0, O.handbrake);
  buf.writeUInt8(st.gear, O.gear);
  buf.writeInt8(Math.max(-127, Math.min(127, Math.round(s.steer * 127))), O.steer);
  buf.writeInt8(0, O.normDrivingLine);
  buf.writeInt8(0, O.normAiBrakeDiff);

  const wear = Math.min(0.5, st.distance / 200000);
  wf(O.tireWearFL, wear); wf(O.tireWearFR, wear);
  wf(O.tireWearRL, wear * 1.3); wf(O.tireWearRR, wear * 1.3);

  return buf;
}

const dt = 1 / HZ;
console.log(`[sim] sending synthetic FH6 packets to ${HOST}:${PORT} at ${HZ}Hz (Ctrl+C to stop)`);
setInterval(() => {
  const s = step(dt);
  const buf = buildPacket(s);
  sock.send(buf, PORT, HOST);
}, 1000 / HZ);
