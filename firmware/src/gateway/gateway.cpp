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

void forwardToCloud(const LoraLink::ReceivedPacket& p) {
    JsonDocument doc;
    doc["dev_eui"]     = p.devEui;
    doc["event"]       = eventName(p.type);
    doc["battery_pct"] = p.batteryPct;
    doc["is_charging"] =
        (p.flags & static_cast<uint8_t>(LoraLink::Flags::IsCharging)) != 0;
    doc["fw_version"]  = p.fwVersion;
    doc["rssi"]        = p.rssi;
    doc["snr"]         = p.snr;

    String body;
    serializeJson(doc, body);

    // TODO(tls): once the backend has a real cert we should pin it. For now
    // we accept anything to keep the prototype simple. Render's CA chain
    // is fine for production.
    WiFiClientSecure client;
    client.setInsecure();
    // Cap the underlying socket at 4 s — without this, a stuck TLS handshake
    // hangs the whole loop forever (no heartbeats, no OLED refresh, no LoRa
    // ack delivery once the buffer drains). 4s gives Render a fair shake
    // while keeping us responsive when the cell signal is flaky.
    client.setTimeout(4);  // seconds (yes, seconds — WiFiClient takes secs)

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
    client.setTimeout(4);  // seconds — keep the socket short-fused too
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
        forwardToCloud(pkt);
        g_packetsForwarded++;

        // Track the device count shown on the OLED. Cap the set to avoid
        // unbounded memory growth in a busy environment — once we hit 64
        // distinct devices we stop adding, the count just stays at 64+
        // (which already says "this gateway is heavily loaded").
        if (g_seenDevEuis.size() < 64) {
            g_seenDevEuis.insert(std::string(pkt.devEui));
        }
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
