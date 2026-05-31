// LoRa point-to-point link between hanger and gateway.
//
// We use a 20-byte payload over the SX1262 in raw LoRa mode (NOT LoRaWAN —
// we don't need OTAA/ABP, we don't need TTN, we control both ends).
//
// Packet shape (20 bytes total, big-endian):
//   [0]    event_type       (1 B)
//   [1]    battery_pct      (1 B, 0-100)
//   [2]    flags            (1 B, see Flags enum)
//   [3]    fw_version       (1 B, packed major/minor 4+4)
//   [4..11] DevEUI suffix    (8 ASCII hex chars)
//   [12..13] seq             (2 B, monotonic per device, wraps at 65535)
//   [14..19] HMAC-SHA256/48  (first 6 bytes of HMAC over [0..13] keyed with
//                              the device's preshared HMAC key)
//
// Why HMAC over the bytes the gateway reads:
//   - prevents spoofing by anyone with a LoRa radio in range
//   - prevents replay attacks (seq is part of HMAC input — incrementing seq
//     means a fresh HMAC is needed for each retx)
//   - 6 bytes ≈ 2^48 brute-force complexity; plenty for 1-hour packets
//
// The gateway validates HMAC + dedupes by (DevEUI, seq) before forwarding to
// the cloud. Replays / spoofs / corrupted packets get silently dropped.
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

// HANGER side — encode + sign + transmit an event packet. Waits for a 4-byte
// ACK from the gateway (`A`, `C`, seq_hi, seq_lo). Retries up to 3 times with
// random back-off if no ACK arrives within 2 s. Puts the radio back to sleep
// before returning. Returns true on confirmed delivery, false on give-up.
//
// In practice the gateway ACKs ~99% of packets on the first try — retries
// only kick in on outright collision or RF dropout, costing ~5 mAh per
// failed send (negligible vs. lost-data cost from the cloud not knowing
// about a real spill).
bool sendEvent(EventType type, uint8_t batteryPct, uint8_t flags);

// HANGER side — quality of the link to the gateway, measured from the ACK the
// gateway sends back on every send (no extra traffic). `ok` is whether the
// most recent send was acknowledged at all; `rssi`/`snr` are that ACK's
// signal as heard by THIS hanger (a real "how strong is my link" number, in
// dBm / dB); `ageMs` is how long ago that measurement was taken. Used to show
// signal strength on the OLED while commissioning. Before the first send,
// `ok` is false and `ageMs` is 0.
struct LinkQuality {
    bool     ok;
    float    rssi;
    float    snr;
    uint32_t ageMs;
};
LinkQuality lastLink();

// GATEWAY side — start continuous receive mode. Packets arriving will fire
// an interrupt; call pollReceived() from the main loop to get them out.
bool startReceive();

// GATEWAY side — non-blocking check for a received packet. Returns true if
// one was decoded AND its HMAC validated AND it isn't a replay of a prior
// (DevEUI, seq) pair. The gateway automatically transmits the 4-byte ACK
// before returning, so the hanger sees confirmation within ~50 ms.
//
// Replays are silently dropped (the cloud already saw that event the first
// time the hanger sent it). Bad HMACs are dropped after logging — usually
// means corruption, occasionally means someone trying to spoof events.
struct ReceivedPacket {
    EventType type;
    uint8_t   batteryPct;
    uint8_t   flags;
    uint8_t   fwVersion;
    uint16_t  seq;
    char      devEui[17];  // null-terminated
    float     rssi;
    float     snr;
};
bool pollReceived(ReceivedPacket* out);

// GATEWAY side — put the radio to sleep. Call this before doing WiFi/TLS
// work (e.g. forwarding a packet to the cloud) so the SX1262 isn't driving
// the shared SPI bus / holding RF resources while the TLS stack runs on the
// same ESP32-S3. Pair with startReceive() afterwards to re-arm.
void sleep();

}  // namespace LoraLink
