#include "nvs_store.h"

#include <Preferences.h>
#include <esp_mac.h>

namespace {
// All BOR settings live in a single NVS namespace. Keys are short to keep
// flash wear in check — NVS rewrites the whole key sector when any value
// changes, so we don't store anything we can recompute cheaply.
constexpr const char* NS = "bor";

constexpr const char* K_WIFI_SSID  = "wifi_ssid";
constexpr const char* K_WIFI_PASS  = "wifi_pass";
constexpr const char* K_DEVEUI     = "deveui";
constexpr const char* K_WEBHOOK    = "webhook";
constexpr const char* K_SECRET     = "secret";
constexpr const char* K_ONBOARDED  = "onboarded";

Preferences prefs;

// Build a 16-hex-char DevEUI from the factory MAC (6 bytes = 12 hex chars)
// plus 4 hex chars derived from the chip's unique ID. Deterministic — same
// chip always gets the same DevEUI.
String computeDefaultDevEui() {
    uint8_t mac[6] = {0};
    esp_efuse_mac_get_default(mac);
    char buf[17];
    snprintf(buf, sizeof(buf), "BOR%02X%02X%02X%02X%02X%02X%01X",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5],
             (mac[0] ^ mac[3] ^ mac[5]) & 0x0f);
    return String(buf);
}

}  // namespace

namespace Config {

void begin() {
    prefs.begin(NS, /*readOnly=*/false);

    // First boot? Generate and burn in a DevEUI so it stays stable across
    // factory resets. The hardware's identity should never change.
    if (!prefs.isKey(K_DEVEUI)) {
        String deveui = computeDefaultDevEui();
        prefs.putString(K_DEVEUI, deveui);
        log_i("first boot — assigned DevEUI %s", deveui.c_str());
    }

    // Default webhook config. Overridable by the BLE setup flow (so we can
    // ship customer-specific URLs without recompiling) but typically left at
    // the factory default.
    if (!prefs.isKey(K_WEBHOOK)) {
        prefs.putString(K_WEBHOOK,
                        "https://bor-systems-backend.onrender.com/webhook/tts");
    }

    // Webhook secret comes from the BOR_WEBHOOK_SECRET shell env var at
    // build time (see platformio.ini). If the build was done without it
    // set, BOR_WEBHOOK_SECRET_BUILD will be the empty string and we leave
    // K_SECRET unset — heartbeats will get 401 until the BLE setup flow
    // provisions one.
#ifdef BOR_WEBHOOK_SECRET_BUILD
    if (!prefs.isKey(K_SECRET)) {
        const String baked = String(BOR_WEBHOOK_SECRET_BUILD);
        if (baked.length() > 0) {
            prefs.putString(K_SECRET, baked);
            log_i("provisioned webhook secret from build flag (%d chars)", baked.length());
        }
    }
#endif
}

String getWifiSsid()      { return prefs.getString(K_WIFI_SSID, ""); }
String getWifiPassword()  { return prefs.getString(K_WIFI_PASS, ""); }

void saveWifiCredentials(const String& ssid, const String& password) {
    prefs.putString(K_WIFI_SSID, ssid);
    prefs.putString(K_WIFI_PASS, password);
}

String getDevEui()        { return prefs.getString(K_DEVEUI, ""); }

String getWebhookUrl()    { return prefs.getString(K_WEBHOOK, ""); }
String getWebhookSecret() { return prefs.getString(K_SECRET, ""); }

void setWebhookConfig(const String& url, const String& secret) {
    prefs.putString(K_WEBHOOK, url);
    prefs.putString(K_SECRET, secret);
}

bool isOnboarded()        { return prefs.getBool(K_ONBOARDED, false); }
void setOnboarded(bool v) { prefs.putBool(K_ONBOARDED, v); }

void factoryReset() {
    prefs.remove(K_WIFI_SSID);
    prefs.remove(K_WIFI_PASS);
    prefs.remove(K_ONBOARDED);
    log_w("factory reset — Wi-Fi credentials wiped, DevEUI preserved");
}

}  // namespace Config
