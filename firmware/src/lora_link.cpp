#include "lora_link.h"
#include "config/nvs_store.h"
#include "../include/pinout.h"

#include <Arduino.h>
#include <RadioLib.h>
#include <Preferences.h>
#include <mbedtls/md.h>
#include <esp_random.h>

namespace {

// ─── Wire format ────────────────────────────────────────────────────────────
constexpr size_t SIGNED_LEN  = 14;            // bytes covered by HMAC
constexpr size_t HMAC_LEN    = 6;             // truncated HMAC-SHA256
constexpr size_t PAYLOAD_LEN = SIGNED_LEN + HMAC_LEN;  // 20 bytes total

// ACK from gateway → hanger after a successful + verified packet.
//   'A', 'C', seq_hi, seq_lo
constexpr size_t ACK_LEN = 4;

// ─── Retry policy ───────────────────────────────────────────────────────────
constexpr uint8_t  MAX_TX_ATTEMPTS = 3;
constexpr uint32_t ACK_TIMEOUT_MS  = 2000;
constexpr uint32_t BASE_BACKOFF_MS = 300;     // ×1, ×2, ×4 with jitter

// ─── Replay-protection state (gateway side) ─────────────────────────────────
// Last seq seen per DevEUI suffix. Kept in RAM only — surviving reboot
// reset means at worst we accept a stale-but-valid packet once.
struct SeenEntry {
    char     deveui[9];
    uint16_t lastSeq;
    uint32_t lastMillis;
};
constexpr size_t SEEN_SIZE = 256;
SeenEntry g_seen[SEEN_SIZE] = {};

// ─── Radio ──────────────────────────────────────────────────────────────────
SX1262 radio = new Module(Pinout::LORA_NSS, Pinout::LORA_DIO1,
                          Pinout::LORA_RST, Pinout::LORA_BUSY);

volatile bool g_rxFlag = false;
void IRAM_ATTR onDio1() { g_rxFlag = true; }

uint8_t packedFwVersion() {
    return ((FW_MAJOR & 0x0F) << 4) | (FW_MINOR & 0x0F);
}

// ─── HMAC key ───────────────────────────────────────────────────────────────
//
// Priority order:
//   1. BOR_LORA_HMAC_KEY_BUILD (baked in at compile time, ENV var). All
//      devices in a fleet built with the same env var share the same key,
//      so hangers and the gateway can sign + verify each other's packets.
//      This is the production path — without it, packets get dropped.
//   2. Fall back to a per-device random NVS key. Kept only for back-compat
//      with prototype builds; doesn't actually work across devices because
//      every device gets a different key.
//
// The original design called for per-device keys distributed via cloud at
// provisioning time, but that mechanism was never wired up. The shared-key
// approach is "good enough" while we're single-tenant: leaking it grants
// the ability to spoof packets within one customer's deployment, not across
// customers.
String hmacKey() {
#ifdef BOR_LORA_HMAC_KEY_BUILD
    {
        const String baked = String(BOR_LORA_HMAC_KEY_BUILD);
        if (baked.length() >= 32) {
            // Accept any length ≥ 32 chars so we're not strict about the
            // 64-hex form — the HMAC library hashes whatever bytes we pass.
            return baked;
        }
    }
#endif

    Preferences p;
    p.begin("borhmac", /*readOnly=*/false);
    String key = p.getString("k", "");
    if (key.length() < 64) {
        // 32 bytes of hardware entropy → 64-char hex. One-time generation.
        // WARNING: every device gets a different random key here, so this
        // path can't actually verify cross-device packets. Build with
        // BOR_LORA_HMAC_KEY set to actually link a fleet.
        char buf[65] = {0};
        for (int i = 0; i < 32; ++i) {
            snprintf(&buf[i*2], 3, "%02x", esp_random() & 0xff);
        }
        key = String(buf);
        p.putString("k", key);
        log_w("HMAC key generated and stored (one-time, RANDOM — NOT cross-device compatible)");
    }
    p.end();
    return key;
}

// HMAC-SHA256, truncated to 6 bytes — written to out[0..5].
void hmacSign(const uint8_t* data, size_t len, uint8_t* out) {
    const String key = hmacKey();
    uint8_t mac[32];
    mbedtls_md_context_t ctx;
    mbedtls_md_init(&ctx);
    const mbedtls_md_info_t* info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
    mbedtls_md_setup(&ctx, info, /*hmac=*/1);
    mbedtls_md_hmac_starts(&ctx,
                           reinterpret_cast<const uint8_t*>(key.c_str()),
                           key.length());
    mbedtls_md_hmac_update(&ctx, data, len);
    mbedtls_md_hmac_finish(&ctx, mac);
    mbedtls_md_free(&ctx);
    memcpy(out, mac, HMAC_LEN);
}

bool hmacVerify(const uint8_t* data, size_t len, const uint8_t* expected) {
    uint8_t computed[HMAC_LEN];
    hmacSign(data, len, computed);
    uint8_t diff = 0;  // constant-time compare
    for (size_t i = 0; i < HMAC_LEN; ++i) diff |= computed[i] ^ expected[i];
    return diff == 0;
}

// ─── Sequence number — monotonic, per-device, persisted across reboot ──────
uint16_t nextSeq() {
    Preferences p;
    p.begin("borseq", /*readOnly=*/false);
    uint16_t s = p.getUShort("s", 0);
    s = static_cast<uint16_t>(s + 1);  // wrap at 65535 is fine
    p.putUShort("s", s);
    p.end();
    return s;
}

// ─── Replay detection (gateway) ────────────────────────────────────────────
bool isReplay(const char deveui[9], uint16_t seq) {
    // Hash the DevEUI into the table — small linear probe handles collisions.
    uint32_t h = 0;
    for (int i = 0; i < 8; ++i) h = h * 131 + (uint8_t)deveui[i];
    for (size_t probe = 0; probe < 16; ++probe) {
        SeenEntry& e = g_seen[(h + probe) % SEEN_SIZE];
        if (e.deveui[0] == 0) {
            // Free slot — record this one and accept.
            memcpy(e.deveui, deveui, 8);
            e.deveui[8] = 0;
            e.lastSeq = seq;
            e.lastMillis = millis();
            return false;
        }
        if (memcmp(e.deveui, deveui, 8) == 0) {
            // Known device. Accept any seq that's "newer" mod 2^16, allowing
            // for hanger reboots (which wrap seq back to 1).
            const uint16_t delta = static_cast<uint16_t>(seq - e.lastSeq);
            const bool fresh = (delta > 0 && delta < 32768)
                              || (millis() - e.lastMillis > 60000);
            if (!fresh) return true;
            e.lastSeq = seq;
            e.lastMillis = millis();
            return false;
        }
    }
    // Table full — accept (rare; would only happen with >256 hangers per gw).
    return false;
}

}  // namespace

namespace LoraLink {

bool begin() {
    SPI.begin(Pinout::LORA_SCK, Pinout::LORA_MISO,
              Pinout::LORA_MOSI, Pinout::LORA_NSS);

    const int state = radio.begin(
        LORA_FREQ_HZ / 1e6,
        LORA_BANDWIDTH_KHZ,
        LORA_SPREADING_FACTOR,
        LORA_CODING_RATE,
        0x12,                       // private sync word
        LORA_TX_POWER_DBM,
        8
    );
    if (state != RADIOLIB_ERR_NONE) {
        log_e("SX1262 begin failed: %d", state);
        return false;
    }

    radio.setDio1Action(onDio1);
    radio.standby();
    log_i("SX1262 ready — %.1f MHz, SF%d, BW %d kHz, %d dBm",
          LORA_FREQ_HZ / 1e6, LORA_SPREADING_FACTOR,
          LORA_BANDWIDTH_KHZ, LORA_TX_POWER_DBM);

    // Initialise HMAC key so the one-time gen doesn't happen during a tx.
    (void)hmacKey();
    return true;
}

bool sendEvent(EventType type, uint8_t batteryPct, uint8_t flags) {
    uint8_t payload[PAYLOAD_LEN] = {0};
    payload[0] = static_cast<uint8_t>(type);
    payload[1] = batteryPct;
    payload[2] = flags;
    payload[3] = packedFwVersion();

    const String devEui = Config::getDevEui();
    const String tail   = devEui.length() >= 8
                              ? devEui.substring(devEui.length() - 8)
                              : devEui;
    memcpy(&payload[4], tail.c_str(), min((size_t)8, tail.length()));

    const uint16_t seq = nextSeq();
    payload[12] = (seq >> 8) & 0xff;
    payload[13] = seq        & 0xff;

    hmacSign(payload, SIGNED_LEN, &payload[14]);

    // ─── Send with ACK + retry ───────────────────────────────────────────
    for (uint8_t attempt = 0; attempt < MAX_TX_ATTEMPTS; ++attempt) {
        const int txState = radio.transmit(payload, PAYLOAD_LEN);
        if (txState != RADIOLIB_ERR_NONE) {
            log_w("tx attempt %d failed: %d", attempt + 1, txState);
        } else {
            // Listen for ACK.
            g_rxFlag = false;
            radio.startReceive();
            const uint32_t start = millis();
            while (millis() - start < ACK_TIMEOUT_MS) {
                if (g_rxFlag) {
                    g_rxFlag = false;
                    uint8_t ack[ACK_LEN] = {0};
                    if (radio.readData(ack, ACK_LEN) == RADIOLIB_ERR_NONE) {
                        if (ack[0] == 'A' && ack[1] == 'C' &&
                            ack[2] == ((seq >> 8) & 0xff) &&
                            ack[3] == ( seq       & 0xff)) {
                            log_i("LoRa tx ack — evt=%d seq=%u attempt=%d",
                                  (int)type, seq, attempt + 1);
                            radio.sleep();
                            return true;
                        }
                    }
                    radio.startReceive();
                }
                delay(10);
            }
            log_w("ACK timeout (attempt %d/%d)", attempt + 1, MAX_TX_ATTEMPTS);
        }
        // Exponential back-off + jitter so multiple hangers don't sync up
        // and keep colliding.
        const uint32_t backoff = BASE_BACKOFF_MS * (1u << attempt)
                                + (esp_random() & 0xFF);
        delay(backoff);
    }

    log_w("LoRa tx gave up after %d attempts — evt=%d", MAX_TX_ATTEMPTS, (int)type);
    radio.sleep();
    return false;
}

bool startReceive() {
    const int state = radio.startReceive();
    if (state != RADIOLIB_ERR_NONE) {
        log_e("startReceive failed: %d", state);
        return false;
    }
    log_i("LoRa rx mode active");
    return true;
}

bool pollReceived(ReceivedPacket* out) {
    if (!g_rxFlag) return false;
    g_rxFlag = false;

    uint8_t buf[PAYLOAD_LEN] = {0};
    const int state = radio.readData(buf, PAYLOAD_LEN);
    radio.startReceive();  // immediately re-arm

    if (state != RADIOLIB_ERR_NONE) {
        log_w("LoRa rx error: %d", state);
        return false;
    }

    // Validate HMAC before trusting any field.
    if (!hmacVerify(buf, SIGNED_LEN, &buf[14])) {
        log_w("LoRa rx HMAC fail — dropping");
        return false;
    }

    out->type       = static_cast<EventType>(buf[0]);
    out->batteryPct = buf[1];
    out->flags      = buf[2];
    out->fwVersion  = buf[3];
    memcpy(out->devEui, &buf[4], 8);
    out->devEui[8]  = 0;
    out->seq        = (buf[12] << 8) | buf[13];
    out->rssi       = radio.getRSSI();
    out->snr        = radio.getSNR();

    // Replay check — same seq within 60s = drop.
    if (isReplay(out->devEui, out->seq)) {
        log_i("LoRa rx replay (deveui=%s seq=%u) — dropping",
              out->devEui, out->seq);
        return false;
    }

    // Send ACK so the hanger stops retransmitting.
    const uint8_t ack[ACK_LEN] = {
        'A', 'C',
        static_cast<uint8_t>((out->seq >> 8) & 0xff),
        static_cast<uint8_t>( out->seq       & 0xff),
    };
    radio.transmit(const_cast<uint8_t*>(ack), ACK_LEN);
    radio.startReceive();

    log_i("LoRa rx ok — evt=%d batt=%d%% deveui=%s seq=%u rssi=%.0f snr=%.1f",
          (int)out->type, out->batteryPct, out->devEui, out->seq,
          out->rssi, out->snr);
    return true;
}

}  // namespace LoraLink
