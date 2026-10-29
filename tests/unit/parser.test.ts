// qi-trace work-item: FH6-1
// qi-trace acceptance-criteria: AC-5, AC-6
// qi-layer: protection-strength
// qi-generated-by: assert-iq
// qi-review-required: true
// qi-risk-tier: medium
//
// FH6 "Data Out" sends 324-byte packets and never the tire-wear block, which needs 339.
// The simulator does send it, so both lengths must parse.

import { describe, expect, it } from 'vitest';
import { BASE_SIZE, OFFSETS as O, parsePacket } from '../../server/parser.js';

function packet(length: number): Buffer {
  const buf = Buffer.alloc(length, 0);
  buf.writeInt32LE(1, O.isRaceOn);
  buf.writeInt32LE(999999, O.carOrdinal);
  buf.writeFloatLE(45, O.speed);
  return buf;
}

describe('parsePacket', () => {
  it('rejects anything shorter than the 323-byte base packet', () => {
    expect(parsePacket(Buffer.alloc(BASE_SIZE - 1))).toBeNull();
  });

  it('parses a live-console 324-byte packet with no tire wear', () => {
    const t = parsePacket(packet(324))!;
    expect(t.isRaceOn).toBe(true);
    expect(t.speed).toBeCloseTo(45, 5);
    expect(t.tireWear, 'FH6 never sends the wear block').toBeNull();
  });

  it('parses a 339-byte packet with the tire-wear block', () => {
    const buf = packet(339);
    buf.writeFloatLE(0.25, O.tireWearFL);
    buf.writeFloatLE(0.5, O.tireWearRR);
    const t = parsePacket(buf)!;
    expect(t.tireWear, 'wear present at 339 bytes').not.toBeNull();
    expect(t.tireWear.fl).toBeCloseTo(0.25, 6);
    expect(t.tireWear.rr).toBeCloseTo(0.5, 6);
  });

  it('reads carOrdinal as a signed 32-bit integer', () => {
    expect(parsePacket(packet(324))!.carOrdinal).toBe(999999);
    // What the simulator used to send: past 2^31 it wraps negative, which the recorder
    // treats as "no car yet" and waits on forever.
    const buf = packet(324);
    buf.writeUInt32LE(2523123456, O.carOrdinal);
    expect(parsePacket(buf)!.carOrdinal).toBe(2523123456 - 2 ** 32);
  });
});
