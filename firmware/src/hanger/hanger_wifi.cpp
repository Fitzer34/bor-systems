#include "hanger_wifi.h"
#include "../battery.h"
#include "../config/nvs_store.h"
#include "../setup_mode/setup_mode.h"
#include "../../include/pinout.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

namespace {

// Mains-powered, so we can heartbeat fast. The web/iOS app's offline detection
// window is 15 s; 5 s gives us 3× headroom against missed packets.
constexpr uint32_t HEARTBEAT_INTERVAL_MS = 5000;

bool lastSignPresent = true;
uint32_t lastHeartbeatMs = 0;

void postEvent(const char* event) {
    if (WiFi.status() != WL_CONNECTED) return;

    JsonDocument doc;
    doc["dev_eui"]     = Config::getDevEui();
    doc["event"]       = event;
    doc["battery_pct"] = Battery::readPercent();
    doc["is_charging"] = Battery::isCharging();
    doc["fw_version"]  = ((FW_MAJOR & 0x0F) << 4) | (FW_MINOR & 0x0F);
    doc["transport"]   = "wifi";

    String body;
    serializeJson(doc, body);

    WiFiClientSecure client;
    client.setInsecure();
    HTTPClient http;
    http.begin(client, Config::getWebhookUrl());
    http.addHeader("Content-Type", "application/json");
    const String secret = Config::getWebhookSecret();
    if (!secret.isEmpty()) http.addHeader("X-BOR-Secret", secret);

    const int code = http.POST(body);
    log_i("webhook %s evt=%s code=%d", body.c_str(), event, code);
    http.end();
}

bool connectWifi() {
    const String ssid = Config::getWifiSsid();
    const String pass = Config::getWifiPassword();
    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid.c_str(), pass.c_str());
    const uint32_t start = millis();
    while (WiFi.status() != WL_CONNECTED) {
        if (millis() - start > 30000) return false;
        delay(250);
    }
    return true;
}

}  // namespace

namespace HangerWifi {

void setup() {
    Config::begin();
    Battery::begin();
    pinMode(Pinout::HALL_SENSOR_PIN, INPUT_PULLUP);

    if (!Config::isOnboarded()) {
        SetupMode::run();
        ESP.restart();
    }

    if (!connectWifi()) {
        log_e("Wi-Fi failed — rebooting in 60s");
        delay(60000);
        ESP.restart();
    }

    lastSignPresent = digitalRead(Pinout::HALL_SENSOR_PIN) == LOW;
    postEvent(lastSignPresent ? "heartbeat" : "lifted");
    lastHeartbeatMs = millis();
}

void loop() {
    const bool present = digitalRead(Pinout::HALL_SENSOR_PIN) == LOW;
    if (present != lastSignPresent) {
        lastSignPresent = present;
        postEvent(present ? "returned" : "lifted");
    }
    if (millis() - lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS) {
        postEvent("heartbeat");
        lastHeartbeatMs = millis();
    }
    delay(50);
}

}  // namespace HangerWifi
