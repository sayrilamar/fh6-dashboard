export interface Corners {
  fl: number;
  fr: number;
  rl: number;
  rr: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Telemetry {
  isRaceOn: boolean;
  timestampMs: number;
  engineMaxRpm: number;
  engineIdleRpm: number;
  currentRpm: number;
  accel: Vec3;
  vel: Vec3;
  angVel: Vec3;
  yaw: number;
  pitch: number;
  roll: number;
  normSusp: Corners;
  slipRatio: Corners;
  wheelSpeed: Corners;
  puddle: Corners;
  rumble: Corners;
  slipAngle: Corners;
  combinedSlip: Corners;
  suspTravelM: Corners;
  carOrdinal: number;
  carClass: number;
  carPI: number;
  drivetrainType: number;
  drivetrain: string;
  numCylinders: number;
  position: Vec3;
  speed: number;
  power: number;
  torque: number;
  tireTempF: Corners;
  tireTempC: Corners;
  boost: number;
  fuel: number;
  distanceTraveled: number;
  bestLap: number;
  lastLap: number;
  currentLap: number;
  currentRaceTime: number;
  lapNumber: number;
  racePosition: number;
  throttle: number;
  brake: number;
  clutch: number;
  handbrake: number;
  gear: number;
  steer: number;
  normDrivingLine: number;
  normAiBrakeDiff: number;
  tireWear: Corners | null;
}

export interface Derived {
  speedKph: number;
  speedMph: number;
  powerHp: number;
  powerKw: number;
  torqueLbFt: number;
  torqueNm: number;
  g: { lat: number; long: number; vert: number; combined: number };
  balance: { frontSlipAngle: number; rearSlipAngle: number; angleBalance: number };
  gripUsage: Corners & { max: number };
  susp: { frontTravel: number; rearTravel: number; vel: Corners };
  driven: { front: number; rear: number; drivenSlip: number; wheelspin: boolean };
  rpmFrac: number;
  boostPsi: number;
}

export interface EngineerNote {
  level: 'info' | 'warn' | 'crit';
  code?: string;
  msg: string;
}

export interface SessionIssue {
  level: 'info' | 'warn' | 'crit';
  msg: string;
  pctStint: number;
  code?: string;
  corners?: string[];
}

export interface Frame {
  type: 'telemetry';
  t: Telemetry;
  d: Derived;
  notes: EngineerNote[];
  ts: number;
}

export interface RecordingStatus {
  recording: boolean;
  armed?: boolean; // record pressed, waiting for a real car to spawn (race grid)
  id?: string;
  frames?: number;
  durationSec?: number;
}

export interface PowerBandPoint {
  rpm: number;
  hp: number;
  torque: number;
}

// The tune actually on the car for a run, confirmed BEFORE recording. Flat
// channel→value map (e.g. rearAccel, frontARB, frontRebound, frontPsi…) so the
// adaptive engine can pair any channel with the outcome it produced.
export type TuneSnapshot = Record<string, number>;

// Channels the driver has marked as sitting at their in-game limit. Needed because
// springs / ride height / aero have CAR-SPECIFIC ranges that can't be hardcoded — the
// planner must know a lever is exhausted so it moves to the next one instead of
// recommending a change the game won't accept.
export type TuneLimits = Record<string, 'min' | 'max'>;

export interface SessionMeta {
  carName?: string;
  carOrdinal?: number;
  carClass?: number;
  carPI?: number;
  drivetrain?: string;
  numCylinders?: number;
  tune?: TuneSnapshot;
  limits?: TuneLimits;
}

export interface SessionAnalytics {
  cleanFrames: number;
  raceFrames: number;
  discardedPct: number;
  muLat: number | null;
  muLat60: number | null;
  peakAccelG: number | null;
  peakBrakeG: number | null;
  zeroTo60: number | null;
  zeroTo100: number | null;
  brake60to0Ft: number | null;
  brake60to0DecelG: number | null;
  cornerExitAxG: number | null;
  cornerExitAxTypicalG: number | null;
  cg: {
    frontTravelPerGIn: number;
    frontTravelChangeIn: number;
    brakeGRef: number;
    r2: number;
    samples: number;
    reliable: boolean;
  } | null;
  avgBrakeEntryMph: number | null;
  brakeEntryZones: number;
  launchSlipPct: number | null;
  launchAccelG: number | null;
  launchPeakAccelG: number | null;
  launchRealSpinPct: number | null;
  launchSamples: number | null;
  launchRpm: number | null;
  launchRpmFracPct: number | null;
  launchVerdict: 'traction-limited' | 'under-geared' | 'optimal' | null;
  launchChangePct: number | null;
  tractionCrossoverMph: number | null;
  damping: {
    fBump: number; fReb: number; rBump: number; rReb: number;
    rmsF: number; rmsR: number;
    balance: 'front-busy' | 'rear-busy' | 'balanced';
    frontRebound: 'soft' | 'ok' | 'stiff' | null;
    rearRebound: 'soft' | 'ok' | 'stiff' | null;
    toppingFrontPct: number;
    toppingRearPct: number;
    samples: number;
  } | null;
  rideHeight: {
    frontPeakComp: number; rearPeakComp: number; // p99 bump travel, 1.0 = bottoming
    frontBottomPct: number; rearBottomPct: number;
    samples: number;
  } | null;
  tires: {
    frontTempF: number; rearTempF: number;
    flTempF: number | null; frTempF: number | null; rlTempF: number | null; rrTempF: number | null;
    idealF: number; coldF: number; hotF: number;
    samples: number;
  } | null;
  aeroBalance: {
    loBal: number; hiBal: number; shift: number; loN: number; hiN: number;
  } | null;
  aero: { muMech: number; aeroGainPer100mph: number; r2: number; speedBins: number } | null;
  balance: { frontSlip: number; rearSlip: number; deltaSlip: number; verdict: string } | null;
  rollGradient: number | null;
  pitchGradient: number | null;
  cdA: { value: number; atSpeedMph: number; powerHp: number } | null;
  rollingRadiusFrontIn: number | null;
  rollingRadiusRearIn: number | null;
  diff: {
    accelSlipFrontPct: number | null;
    accelSlipRearPct: number | null;
    brakeSlipFrontPct: number | null;   // median across braking frames
    brakeSlipRearPct: number | null;
    brakeSlipFrontPeakPct?: number | null;  // p95 — display only
    brakeSlipRearPeakPct?: number | null;
  };
  dyno: {
    peakHp: number | null;
    peakHpRpm: number | null;
    peakTorque: number | null;
    peakTorqueRpm: number | null;
    powerBandWidthRpm: number | null;
    redlineRpm: number | null;
    avgShiftRpm: number | null;
    autoShiftRpm: number | null;
    autoShiftPctRedline: number | null;
    shiftPerGear: { gear: number; rpm: number; landing?: number | null }[];
  };
  gearing: {
    numGears: number;
    shiftRpm: number;       // flat-out shift RPM (predicts even-spacing landings)
    peakHpRpm: number;
    peakTorqueRpm: number | null;
    powerBandLoRpm: number; // bottom of usable power band; land above this or it bogs
    measured: {             // diagnostic overlay — which gears actually bogged on the road
      gear: number; fromGear: number; shiftRpm: number; landingRpm: number; landingHpPct: number;
    }[];
    finalDrive: {           // top-gear RPM usage on the straight → accel/top-speed lever
      topGear: number; topGearMaxRpm: number; topGearRpmPct: number; limiterPct: number;
      redlineRpm: number; samples: number;
    } | null;
  } | null;
  powertrain: { level: 'info' | 'warn' | 'crit'; title: string; text: string }[];
  handling: {
    cornerFrames: number;
    overall: 'oversteer' | 'understeer' | 'neutral';
    oversteerFrames: number;
    understeerFrames: number;
    entry: { os: number; us: number; osPct: number; usPct: number };
    mid: { os: number; us: number; osPct: number; usPct: number };
    exit: { os: number; us: number; osPct: number; usPct: number };
    dominantOversteerPhase: 'entry' | 'mid' | 'exit' | null;
    dominantUndersteerPhase: 'entry' | 'mid' | 'exit' | null;
    slideEvents: number;
    slideCause: { trailBrake: number; power: number; grip: number };
    slideCausePer1k: { trailBrake: number; power: number; grip: number };
    slideDominantCause: 'trailBrake' | 'power' | 'grip' | null;
    slideMedianMph: number | null;
    brakeStability: 'rear-loose' | 'front-lock' | 'stable' | null;
  } | null;
}

export interface SessionSummary {
  id: string;
  meta?: SessionMeta;
  analytics?: SessionAnalytics;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  frames: number;
  peakHp: number;
  peakHpRpm: number;
  peakTorque: number;
  peakTorqueRpm: number;
  redlineRpm?: number;
  avgShiftRpm?: number | null;
  shiftCount?: number;
  issues?: SessionIssue[];
  maxGLat: number;
  maxAccelG: number;
  maxBrakeG: number;
  maxCombinedG?: number;
  maxSpeedKph: number;
  avgSpeedKph?: number;
  topTireC: Corners;
  peakSlipAngleFront?: number;
  peakSlipAngleRear?: number;
  maxWheelslipPct?: number;
  bottomingEvents?: number;
  fullThrottlePct?: number;
  lapsCompleted?: number;
  avgLapSec?: number | null;
  lapConsistencySec?: number | null;
  fuelUsedPct?: number | null;
  fuelPerLapPct?: number | null;
  bestLap: number | null;
  raceTimeSec?: number | null; // sprint/point-to-point finish time (no lap crossing)
  finishDistanceM?: number | null;
  powerBand: PowerBandPoint[];
}
