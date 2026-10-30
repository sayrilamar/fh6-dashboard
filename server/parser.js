// Forza Horizon 6 "Data Out" UDP packet parser.
//
// FH6 uses the standard Forza V2 / "Dash" format, byte-for-byte identical to FH5.
// Layout: 232-byte "Sled" block, then a 12-byte Horizon placeholder (offsets
// 232-243), then the "Dash" block. Base packet is 323 bytes (offsets 0-322).
// FH adds an optional tire-wear extension (4x f32 at 323/327/331/335) and a
// trailing track ordinal, so real packets are typically 324+ bytes.
//
// Verified against the working FH6 tools TheBanHammer/fh6-tel and
// satyajiit/forza-horizon-6-moza-bridge.

const SLED_SIZE = 232;
const BASE_SIZE = 323; // through NormalizedAIBrakeDifference (offset 322)

// Field offsets within the packet.
const O = {
  isRaceOn: 0, // s32
  timestampMs: 4, // u32
  engineMaxRpm: 8,
  engineIdleRpm: 12,
  currentRpm: 16,
  accelX: 20,
  accelY: 24,
  accelZ: 28,
  velX: 32,
  velY: 36,
  velZ: 40,
  angVelX: 44,
  angVelY: 48,
  angVelZ: 52,
  yaw: 56,
  pitch: 60,
  roll: 64,
  // Normalized suspension travel 0..1 (0 = full droop, 1 = full compression)
  normSuspFL: 68,
  normSuspFR: 72,
  normSuspRL: 76,
  normSuspRR: 80,
  slipRatioFL: 84,
  slipRatioFR: 88,
  slipRatioRL: 92,
  slipRatioRR: 96,
  wheelSpeedFL: 100,
  wheelSpeedFR: 104,
  wheelSpeedRL: 108,
  wheelSpeedRR: 112,
  rumbleFL: 116,
  rumbleFR: 120,
  rumbleRL: 124,
  rumbleRR: 128,
  puddleFL: 132,
  puddleFR: 136,
  puddleRL: 140,
  puddleRR: 144,
  surfaceRumbleFL: 148,
  surfaceRumbleFR: 152,
  surfaceRumbleRL: 156,
  surfaceRumbleRR: 160,
  slipAngleFL: 164,
  slipAngleFR: 168,
  slipAngleRL: 172,
  slipAngleRR: 176,
  combinedSlipFL: 180,
  combinedSlipFR: 184,
  combinedSlipRL: 188,
  combinedSlipRR: 192,
  suspTravelMFL: 196,
  suspTravelMFR: 200,
  suspTravelMRL: 204,
  suspTravelMRR: 208,
  carOrdinal: 212, // s32
  carClass: 216, // s32
  carPI: 220, // s32
  drivetrainType: 224, // s32
  numCylinders: 228, // s32
  // 232-243: Horizon placeholder (12 bytes)
  positionX: 244,
  positionY: 248,
  positionZ: 252,
  speed: 256, // m/s
  power: 260, // watts
  torque: 264, // Nm
  tireTempFL: 268, // Fahrenheit
  tireTempFR: 272,
  tireTempRL: 276,
  tireTempRR: 280,
  boost: 284,
  fuel: 288, // fraction 0..1
  distanceTraveled: 292, // meters
  bestLap: 296, // seconds
  lastLap: 300,
  currentLap: 304,
  currentRaceTime: 308,
  lapNumber: 312, // u16
  racePosition: 314, // u8
  throttle: 315, // u8 0..255
  brake: 316, // u8 0..255
  clutch: 317, // u8 0..255
  handbrake: 318, // u8 0..255
  gear: 319, // u8
  steer: 320, // s8 -127..127
  normDrivingLine: 321, // s8
  normAiBrakeDiff: 322, // s8
  // Optional FH tire-wear extension
  tireWearFL: 323, // f32
  tireWearFR: 327,
  tireWearRL: 331,
  tireWearRR: 335,
};

const DRIVETRAIN = ['FWD', 'RWD', 'AWD'];

const f = (b, o) => b.readFloatLE(o);

export function parsePacket(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < BASE_SIZE) return null;

  const hasWear = buf.length >= O.tireWearFL + 16;

  const fToC = (degF) => ((degF - 32) * 5) / 9;

  const t = {
    isRaceOn: buf.readInt32LE(O.isRaceOn) === 1,
    timestampMs: buf.readUInt32LE(O.timestampMs),

    engineMaxRpm: f(buf, O.engineMaxRpm),
    engineIdleRpm: f(buf, O.engineIdleRpm),
    currentRpm: f(buf, O.currentRpm),

    accel: { x: f(buf, O.accelX), y: f(buf, O.accelY), z: f(buf, O.accelZ) },
    vel: { x: f(buf, O.velX), y: f(buf, O.velY), z: f(buf, O.velZ) },
    angVel: { x: f(buf, O.angVelX), y: f(buf, O.angVelY), z: f(buf, O.angVelZ) },

    yaw: f(buf, O.yaw),
    pitch: f(buf, O.pitch),
    roll: f(buf, O.roll),

    // 0 = full droop (extended), 1 = full compression (bottoming)
    normSusp: {
      fl: f(buf, O.normSuspFL),
      fr: f(buf, O.normSuspFR),
      rl: f(buf, O.normSuspRL),
      rr: f(buf, O.normSuspRR),
    },
    slipRatio: {
      fl: f(buf, O.slipRatioFL),
      fr: f(buf, O.slipRatioFR),
      rl: f(buf, O.slipRatioRL),
      rr: f(buf, O.slipRatioRR),
    },
    wheelSpeed: {
      fl: f(buf, O.wheelSpeedFL),
      fr: f(buf, O.wheelSpeedFR),
      rl: f(buf, O.wheelSpeedRL),
      rr: f(buf, O.wheelSpeedRR),
    },
    puddle: {
      fl: f(buf, O.puddleFL),
      fr: f(buf, O.puddleFR),
      rl: f(buf, O.puddleRL),
      rr: f(buf, O.puddleRR),
    },
    // WheelOnRumbleStrip: ~1.0 when that wheel is on a kerb/rumble strip. Used
    // to discard surface-impact frames before computing grip statistics.
    rumble: {
      fl: f(buf, O.rumbleFL),
      fr: f(buf, O.rumbleFR),
      rl: f(buf, O.rumbleRL),
      rr: f(buf, O.rumbleRR),
    },
    slipAngle: {
      fl: f(buf, O.slipAngleFL),
      fr: f(buf, O.slipAngleFR),
      rl: f(buf, O.slipAngleRL),
      rr: f(buf, O.slipAngleRR),
    },
    combinedSlip: {
      fl: f(buf, O.combinedSlipFL),
      fr: f(buf, O.combinedSlipFR),
      rl: f(buf, O.combinedSlipRL),
      rr: f(buf, O.combinedSlipRR),
    },
    suspTravelM: {
      fl: f(buf, O.suspTravelMFL),
      fr: f(buf, O.suspTravelMFR),
      rl: f(buf, O.suspTravelMRL),
      rr: f(buf, O.suspTravelMRR),
    },

    carOrdinal: buf.readInt32LE(O.carOrdinal),
    carClass: buf.readInt32LE(O.carClass),
    carPI: buf.readInt32LE(O.carPI),
    drivetrainType: buf.readInt32LE(O.drivetrainType),
    drivetrain: DRIVETRAIN[buf.readInt32LE(O.drivetrainType)] ?? 'UNK',
    numCylinders: buf.readInt32LE(O.numCylinders),

    position: { x: f(buf, O.positionX), y: f(buf, O.positionY), z: f(buf, O.positionZ) },
    speed: f(buf, O.speed),
    power: f(buf, O.power),
    torque: f(buf, O.torque),

    tireTempF: {
      fl: f(buf, O.tireTempFL),
      fr: f(buf, O.tireTempFR),
      rl: f(buf, O.tireTempRL),
      rr: f(buf, O.tireTempRR),
    },
    tireTempC: {
      fl: fToC(f(buf, O.tireTempFL)),
      fr: fToC(f(buf, O.tireTempFR)),
      rl: fToC(f(buf, O.tireTempRL)),
      rr: fToC(f(buf, O.tireTempRR)),
    },

    boost: f(buf, O.boost),
    fuel: f(buf, O.fuel),
    distanceTraveled: f(buf, O.distanceTraveled),

    bestLap: f(buf, O.bestLap),
    lastLap: f(buf, O.lastLap),
    currentLap: f(buf, O.currentLap),
    currentRaceTime: f(buf, O.currentRaceTime),
    lapNumber: buf.readUInt16LE(O.lapNumber),
    racePosition: buf.readUInt8(O.racePosition),

    throttle: buf.readUInt8(O.throttle) / 255,
    brake: buf.readUInt8(O.brake) / 255,
    clutch: buf.readUInt8(O.clutch) / 255,
    handbrake: buf.readUInt8(O.handbrake) / 255,
    gear: buf.readUInt8(O.gear),
    steer: buf.readInt8(O.steer) / 127,
    normDrivingLine: buf.readInt8(O.normDrivingLine),
    normAiBrakeDiff: buf.readInt8(O.normAiBrakeDiff),

    tireWear: hasWear
      ? {
          fl: f(buf, O.tireWearFL),
          fr: f(buf, O.tireWearFR),
          rl: f(buf, O.tireWearRL),
          rr: f(buf, O.tireWearRR),
        }
      : null,

    // Bytes the app doesn't decode, kept raw so recordings can show whether FH6 encodes
    // the event, track or surface in them (FH6-28): the 12-byte Horizon placeholder, and
    // whatever follows the base packet (and the tire-wear block, when present). Hex.
    rawPlaceholder: buf.subarray(SLED_SIZE, SLED_SIZE + 12).toString('hex'),
    rawTail: buf.subarray(hasWear ? O.tireWearFL + 16 : BASE_SIZE).toString('hex'),
  };

  return t;
}

export { O as OFFSETS, SLED_SIZE, BASE_SIZE };
