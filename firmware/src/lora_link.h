// LoRa point-to-point link between hanger and gateway.
//
// We use a simple 8-byte payload over the SX1262 in raw LoRa mode (NOT
// LoRaWAN — we don't need OTAA/ABP, we don't need TTN, we control both ends).
// One byte event-type, one byte battery %, one byte flags, one byte fw
// version, four bytes DevEUI suffix for routing.
//
// Event-type values must stay byte-compatible with shared/payload.ts and the
// backend webhook decoder.
#pragma once

#include <cstdint>

namespace LoraLink {

enum class EventType : uint8_t {
    Lifted          = 0x01,
    Returned        = 0x02,
    Heartbeat       = 0x03,
    LowBattery      = 0x04,
    CleaningStarted = 0x05,
};

enum class Flags : uint8_t {
    None        = 0x00,
    IsCharging  = 0x01,  // USB power present
    TestPressed = 0x02,  // test button pressed since last uplink
};

// SX1262 initialisation. Call once from setup() on both hanger and gateway.
// Returns true on success; logs and returns false if the chip didn't respond
// (usually means the SPI wiring is wrong or the wrong board variant).
bool begin();

// HANGER side — encode and transmit an event packet to whichever gateway is
// listening. Blocks until the transmission completes (~600 ms at SF9). Puts
// the radio back to sleep before returning. Returns true on success.
bool sendEvent(EventType type, uint8_t batteryPct, uint8_t flags);

// GATEWAY side — start continuous receive mode. Packets arriving will fire
// an interrupt; call pollReceived() from the main loop to get them out.
bool startReceive();

// GATEWAY side — non-blocking check for a received packet. Returns true if
// one was decoded into *out_*. Resumes receive automatically.
struct ReceivedPacket {
    EventType type;
    uint8_t   batteryPct;
    uint8_t   flags;
    uint8_t   fwVersion;
    char      devEui[17];  // null-terminated
    float     rssi;
    float     snr;
};
bool pollReceived(ReceivedPacket* out);

}  // namespace LoraLink
