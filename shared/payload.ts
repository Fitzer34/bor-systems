/**
 * LoRaWAN uplink payload — 4 bytes, decoded by the backend webhook and
 * encoded by the firmware. Keep in sync with firmware/src/main.cpp.
 *
 * Byte 0: event_type (1=lifted, 2=returned, 3=heartbeat, 4=low_battery)
 * Byte 1: battery_pct (0..100)
 * Byte 2: firmware_version (high nibble=major, low nibble=minor)
 * Byte 3: flags (bit0=test_button_pressed_since_last_uplink)
 */

export const EVENT_TYPE = {
  LIFTED: 1,
  RETURNED: 2,
  HEARTBEAT: 3,
  LOW_BATTERY: 4,
} as const;

export type EventTypeName = "lifted" | "returned" | "heartbeat" | "low_battery";

const NAME_BY_CODE: Record<number, EventTypeName> = {
  [EVENT_TYPE.LIFTED]: "lifted",
  [EVENT_TYPE.RETURNED]: "returned",
  [EVENT_TYPE.HEARTBEAT]: "heartbeat",
  [EVENT_TYPE.LOW_BATTERY]: "low_battery",
};

export interface DecodedPayload {
  eventType: EventTypeName;
  batteryPct: number;
  firmwareVersion: string;
  testButtonPressed: boolean;
}

export class PayloadDecodeError extends Error {}

export function decodePayload(bytes: Uint8Array): DecodedPayload {
  if (bytes.length < 4) {
    throw new PayloadDecodeError(`expected 4 bytes, got ${bytes.length}`);
  }
  const code = bytes[0]!;
  const eventType = NAME_BY_CODE[code];
  if (!eventType) {
    throw new PayloadDecodeError(`unknown event_type 0x${code.toString(16)}`);
  }
  const batteryPct = bytes[1]!;
  if (batteryPct > 100) {
    throw new PayloadDecodeError(`battery_pct out of range: ${batteryPct}`);
  }
  const fwByte = bytes[2]!;
  const firmwareVersion = `${(fwByte >> 4) & 0x0f}.${fwByte & 0x0f}`;
  const flags = bytes[3]!;
  return {
    eventType,
    batteryPct,
    firmwareVersion,
    testButtonPressed: (flags & 0x01) !== 0,
  };
}

export function encodePayload(p: {
  eventType: EventTypeName;
  batteryPct: number;
  firmwareMajor: number;
  firmwareMinor: number;
  testButtonPressed: boolean;
}): Uint8Array {
  const code = (Object.entries(NAME_BY_CODE).find(([, n]) => n === p.eventType)?.[0] ??
    EVENT_TYPE.LIFTED) as unknown as number;
  return new Uint8Array([
    Number(code),
    Math.max(0, Math.min(100, p.batteryPct)),
    ((p.firmwareMajor & 0x0f) << 4) | (p.firmwareMinor & 0x0f),
    p.testButtonPressed ? 0x01 : 0x00,
  ]);
}
