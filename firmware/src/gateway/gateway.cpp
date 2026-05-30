#include "gateway.h"
#include "../button_handler.h"
#include "../config/nvs_store.h"
#include "../display.h"
#include "../lora_link.h"
#include "../ota.h"
#include "../setup_mode/setup_mode.h"
#include "../../include/pinout.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <set>
#include <string>

namespace {

constexpr uint32_t WIFI_TIMEOUT_MS = 30000;

// Map our internal EventType to the string the backend webhook expects.
const char* eventName(LoraLink::EventType t) {
    switch (t) {
        case LoraLink::EventType::Lifted:          return "lifted";
        case LoraLink::EventType::Returned:        return "returned";
        case LoraLink::EventType::Heartbeat:       return "heartbeat";
        case LoraLink::EventType::LowBattery:      return "low_battery";
        case LoraLink::EventType::CleaningStarted: return "cleaning_started";
    }
    return "unknown";
}

bool connectWifi() {
    const String ssid = Config::getWifiSsid();
    const String pass = Config::getWifiPassword();
    if (ssid.isEmpty()) return false;

    log_i("connecting to Wi-Fi %s", ssid.c_str());
    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid.c_str(), pass.c_str());

    const uint32_t start = millis();
    while (WiFi.status() != WL_CONNECTED) {
        if (millis() - start > WIFI_TIMEOUT_MS) {
            log_e("Wi-Fi connect timeout");
            return false;
        }
        delay(250);
    }
    log_i("connected — IP %s, RSSI %d dBm",
          WiFi.localIP().toString().c_str(), WiFi.RSSI());
    return true;
}

// Base64-encode 4 raw bytes (no padding edge cases — 4 bytes → 8 chars incl
// one '=' pad). Tiny standalone encoder so we don't pull in a library.
static String base64_4(const uint8_t in[4]) {
    static const char* T =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    char out[9];
    out[0] = T[(in[0] >> 2) & 0x3F];
    out[1] = T[((in[0] & 0x03) << 4) | ((in[1] >> 4) & 0x0F)];
    out[2] = T[((in[1] & 0x0F) << 2) | ((in[2] >> 6) & 0x03)];
    out[3] = T[in[2] & 0x3F];
    out[4] = T[(in[3] >> 2) & 0x3F];
    out[5] = T[(in[3] & 0x03) << 4];
    out[6] = '=';
    out[7] = '=';
    out[8] = '\0';
    return String(out);
}

void forwardToCloud(const LoraLink::ReceivedPacket& p) {
    // The backend webhook (/webhook/tts) decodes the TTN/LoRaWAN uplink
    // shape: end_device_ids.dev_eui + a base64 frm_payload it then decodes
    // as our 4-byte event packet (event, battery, fw, flags). We MUST send
    // exactly that shape — an earlier flat {dev_eui, event, …} body was
    // rejected with 400 "missing dev_eui or frm_payload" and silently lost
    // every real hanger event.
    //
    // Re-encode the 4 payload bytes from the fields we decoded off LoRa:
    //   byte0 = event type code (1=lifted … 5=cleaning_started)
    //   byte1 = battery %
    //   byte2 = fw version (already packed major<<4|minor)
    //   byte3 = flags
    uint8_t raw[4];
    switch (p.type) {
        case LoraLink::EventType::Lifted:          raw[0] = 1; break;
        case LoraLink::EventType::Returned:        raw[0] = 2; break;
        case LoraLink::EventType::Heartbeat:       raw[0] = 3; break;
        case LoraLink::EventType::LowBattery:      raw[0] = 4; break;
        case LoraLink::EventType::CleaningStarted: raw[0] = 5; break;
        default:                                   raw[0] = 3; break;
    }
    raw[1] = p.batteryPct;
    raw[2] = p.fwVersion;
    raw[3] = p.flags;

    JsonDocument doc;
    doc["end_device_ids"]["dev_eui"] = p.devEui;
    doc["uplink_message"]["f_port"]  = 1;
    doc["uplink_message"]["frm_payload"] = base64_4(raw);
    // Pass LoRa link quality through as extra fields — the webhook ignores
    // unknown keys, but they're handy if we later log signal strength.
    doc["uplink_message"]["rx_metadata"][0]["rssi"] = (int)p.rssi;
    doc["uplink_message"]["rx_metadata"][0]["snr"]  = p.snr;

    String body;
    serializeJson(doc, body);

    // TODO(tls): once the backend has a real cert we should pin it. For now
    // we accept anything to keep the prototype simple. Render's CA chain
    // is fine for production.
    WiFiClientSecure client;
    client.setInsecure();
    // ── Three separate timeouts, three separate failure modes ──
    //   setHandshakeTimeout: TLS handshake (default 120s!) — the actual
    //     killer; sockets that get stuck mid-TLS hang the whole loop here
    //     for two minutes per failed attempt without this set.
    //   setTimeout: socket read after connection — established phase.
    //   HTTPClient.setConnectTimeout: TCP connect (set below).
    client.setHandshakeTimeout(5);  // seconds
    client.setTimeout(4);            // seconds

    HTTPClient http;
    // Total time we're willing to block on a single POST. Covers TCP connect
    // + TLS handshake + send + response. 5 s is generous for a 200-byte
    // payload to Render Frankfurt over a typical WiFi link.
    http.setConnectTimeout(5000);
    http.setTimeout(5000);
    http.setReuse(false);

    if (!http.begin(client, Config::getWebhookUrl())) {
        log_w("http.begin() failed — skipping forward");
        return;
    }
    http.addHeader("Content-Type", "application/json");
    const String secret = Config::getWebhookSecret();
    if (!secret.isEmpty()) {
        http.addHeader("X-BOR-Secret", secret);
    }

    const int code = http.POST(body);
    if (code <= 0) {
        // Negative codes from HTTPClient mean transport-level failure
        // (timeout, connection refused, TLS error). Don't try to read the
        // body — it just produces another timeout.
        log_w("webhook POST transport error: %d", code);
    } else if (code != 200 && code != 204 && code != 202) {
        log_w("webhook POST failed: %d body=%s",
              code, http.getString().c_str());
    } else {
        log_i("webhook ok — %s evt=%s batt=%d%%",
              p.devEui, eventName(p.type), p.batteryPct);
    }
    http.end();
}

}  // namespace

namespace {

uint32_t g_packetsForwarded = 0;
uint32_t g_lastOtaCheckMs   = 0;
uint32_t g_lastHeartbeatMs  = 0;
uint32_t g_bootMs           = 0;

// Set of DevEUIs we've ever heard on LoRa during this boot session. Counted
// up on the OLED ("N devices connected"). Reset on reboot — long-term we'd
// also evict entries after N hours of silence so the count reflects "active
// nearby" not "ever-seen", but for the prototype boot-scoped is fine.
// Bounded to ~64 entries (~1 KB) to keep RAM use trivial.
std::set<std::string> g_seenDevEuis;
constexpr uint32_t OTA_CHECK_INTERVAL_MS       = 6UL * 60UL * 60UL * 1000UL;  // 6h
constexpr uint32_t HEARTBEAT_INTERVAL_MS       = 60UL * 1000UL;               // 60s — fast enough to flip the Online badge

/// Tell the cloud "I'm alive". Sent once on boot (so the gateway shows up
/// in the dashboard immediately) and then every 60 s after that. The
/// backend uses these to keep `last_seen_at` fresh and surface the device
/// in Manage → Gateways. Cheap: ~200-byte JSON over TLS, runs async.
void sendHeartbeat() {
    if (WiFi.status() != WL_CONNECTED) return;  // no point trying

    JsonDocument doc;
    doc["devEui"]           = Config::getDevEui();
    doc["ipAddress"]        = WiFi.localIP().toString();
    doc["ssid"]             = WiFi.SSID();
    doc["rssi"]             = WiFi.RSSI();
    char fwBuf[16];
    snprintf(fwBuf, sizeof(fwBuf), "v%d.%d", FW_MAJOR, FW_MINOR);
    doc["firmwareVersion"]  = fwBuf;
    doc["packetsForwarded"] = g_packetsForwarded;
    doc["uptimeSec"]        = (millis() - g_bootMs) / 1000UL;

    String body;
    serializeJson(doc, body);

    // Derive heartbeat URL from the webhook URL: strip /webhook/tts, add
    // /gateways/heartbeat. Lets us swap dev/prod targets without recompiling.
    String url = Config::getWebhookUrl();
    const int idx = url.indexOf("/webhook");
    if (idx > 0) url.remove(idx);
    url += "/gateways/heartbeat";

    WiFiClientSecure client;
    client.setInsecure();  // TODO: pin Render's CA
    // setHandshakeTimeout is the critical one — default is 120s and a stuck
    // TLS handshake will hang the whole gateway loop while it's waiting.
    // 5s is plenty for Render Frankfurt over a healthy WiFi link.
    client.setHandshakeTimeout(5);  // seconds
    client.setTimeout(4);            // seconds — read after connect
    HTTPClient http;
    http.setConnectTimeout(5000);
    http.setTimeout(5000);
    http.setReuse(false);
    if (!http.begin(client, url)) {
        log_w("heartbeat http.begin() failed");
        return;
    }
    http.addHeader("Content-Type", "application/json");
    const String secret = Config::getWebhookSecret();
    if (!secret.isEmpty()) http.addHeader("X-BOR-Secret", secret);

    const int code = http.POST(body);
    if (code <= 0) {
        log_w("heartbeat transport error: %d", code);
    } else if (code == 200) {
        log_i("heartbeat ok");
    } else {
        log_w("heartbeat HTTP %d — backend may not know this gateway yet", code);
    }
    http.end();
}

/// Map RSSI (negative dBm) to a 0-4 bar count, the way phones do.
/// Boundaries chosen empirically from typical WiFi router setups in
/// hospitals / restaurants:
///   -45 dBm and above → 4 bars (right next to AP)
///   -55 to -45        → 3 bars (same room as AP, good)
///   -65 to -55        → 2 bars (next room over, fine)
///   -75 to -65        → 1 bar  (across the building, marginal)
///   below -75         → 0 bars (won't stay connected for long)
int wifiBars(int rssi) {
    if (rssi >= -45) return 4;
    if (rssi >= -55) return 3;
    if (rssi >= -65) return 2;
    if (rssi >= -75) return 1;
    return 0;
}

void refreshDisplay() {
    char l1[32], l2[32], l3[32];
    const int rssi = WiFi.RSSI();
    const int bars = wifiBars(rssi);

    // Filled pipes for active bars, dots for inactive. Renders cleanly in
    // the SSD1306 default 10pt font (Unicode block chars don't).
    char wifiBars[5] = "....";
    for (int i = 0; i < bars && i < 4; ++i) wifiBars[i] = '|';

    snprintf(l1, sizeof(l1), "HazardLink Gateway");
    snprintf(l2, sizeof(l2), "%u device%s connected",
             (unsigned)g_seenDevEuis.size(),
             g_seenDevEuis.size() == 1 ? "" : "s");
    snprintf(l3, sizeof(l3), "WiFi %s %d dBm", wifiBars, rssi);

    // Last slot left blank for visual breathing room — the customer doesn't
    // need uptime or IP staring at them, those live in the dashboard.
    Display::showStatus(l1, l2, l3, "");
}

}  // namespace

namespace Gateway {

void setup() {
    Config::begin();
    pinMode(Pinout::TEST_BUTTON_PIN, INPUT_PULLUP);

    if (!Config::isOnboarded()) {
        log_w("gateway not onboarded — entering BLE setup mode");
        SetupMode::run();
        ESP.restart();
    }

    Display::begin();
    Display::showStatus("HazardLink Gateway", "Connecting Wi-Fi...", "", "");

    if (!connectWifi()) {
        log_e("could not connect to Wi-Fi — rebooting in 60s");
        delay(60000);
        ESP.restart();
    }

    if (!LoraLink::begin() || !LoraLink::startReceive()) {
        log_e("LoRa init failed — rebooting in 60s");
        delay(60000);
        ESP.restart();
    }

    // Confirm the running OTA image works end-to-end before letting the
    // bootloader stop rolling back. Without this call, a bad firmware
    // crashing on boot would revert automatically — exactly what we want.
    Ota::markRunningImageGood();

    log_i("gateway ready — listening for LoRa packets");

    // Self-register / heartbeat immediately so the gateway pops up in the
    // dashboard's Manage → Gateways list within seconds of joining WiFi.
    // Repeats every HEARTBEAT_INTERVAL_MS thereafter (handled in loop()).
    g_bootMs = millis();
    sendHeartbeat();
    g_lastHeartbeatMs = millis();

    refreshDisplay();
}

void loop() {
    // Reconnect Wi-Fi if it drops (the AP momentarily disconnects, etc.).
    if (WiFi.status() != WL_CONNECTED) {
        log_w("Wi-Fi dropped — reconnecting");
        connectWifi();
    }

    LoraLink::ReceivedPacket pkt;
    while (LoraLink::pollReceived(&pkt)) {
        // Track the device count shown on the OLED *first* — this is purely
        // local and must reflect "we heard it" even if the cloud forward
        // later fails. Cap the set to bound RAM (≤64 distinct devices).
        if (g_seenDevEuis.size() < 64) {
            g_seenDevEuis.insert(std::string(pkt.devEui));
        }

        // CRITICAL ordering: the SX1262 LoRa radio and the WiFi/TLS stack
        // both run on the one ESP32-S3. pollReceived() just transmitted an
        // ACK and re-armed the radio into continuous receive — leaving it
        // actively driving the shared SPI + holding RF resources. Spinning
        // up a TLS connection while the radio is in that state makes the
        // HTTPS POST stall and fail (exactly the symptom: LoRa ack works,
        // OLED counts the device, but the cloud forward never lands).
        //
        // Fix: park the radio in sleep before the forward, then re-arm
        // receive afterwards. Heartbeats never hit this because they run
        // when no packet just arrived (radio idle-listening, not mid-txn).
        LoraLink::sleep();
        forwardToCloud(pkt);
        g_packetsForwarded++;
        LoraLink::startReceive();  // re-arm for the next hanger packet
    }

    // Long-press the test button (10 s) → factory reset, re-enter BLE setup.
    ButtonHandler::checkLongPress();  // calls esp_restart() on trigger

    // Heartbeat every 60 s so the dashboard knows the gateway is alive.
    if (millis() - g_lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS) {
        g_lastHeartbeatMs = millis();
        sendHeartbeat();
    }

    // OTA check every 6 hours.
    if (millis() - g_lastOtaCheckMs >= OTA_CHECK_INTERVAL_MS) {
        g_lastOtaCheckMs = millis();
        Ota::checkAndApply("heltec_v3_gateway", "stable");
    }

    // Refresh OLED ~once a second so customers see the packet counter ticking.
    static uint32_t lastDispMs = 0;
    if (millis() - lastDispMs > 1000) {
        lastDispMs = millis();
        refreshDisplay();
    }

    delay(10);  // yield to RTOS — keeps watchdog happy without burning CPU
}

}  // namespace Gateway
