#include "ota.h"
#include "config/nvs_store.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <esp_https_ota.h>
#include <esp_ota_ops.h>

namespace {

// Manifest endpoint sits on the same backend as the webhook. The cloud team
// can roll different channels (stable / beta / canary) without changing the
// device — just deploy a new manifest and the next OTA check picks it up.
String manifestUrl(const String& model, const String& channel,
                   const String& currentVersion) {
    String base = Config::getWebhookUrl();
    // Strip the /webhook/tts suffix to get the API root.
    const int idx = base.indexOf("/webhook");
    if (idx > 0) base.remove(idx);
    return base + "/firmware/manifest?model=" + model
                + "&channel=" + channel
                + "&current=" + currentVersion;
}

bool versionStrip(String& v) {
    if (v.startsWith("v") || v.startsWith("V")) v = v.substring(1);
    return v.length() > 0;
}

}  // namespace

namespace Ota {

bool fetchManifest(const String& model, const String& channel,
                   const String& currentVersion, Manifest* out) {
    WiFiClientSecure client;
    client.setInsecure();  // TODO: pin the backend cert
    HTTPClient http;
    http.setTimeout(10000);

    const String url = manifestUrl(model, channel, currentVersion);
    if (!http.begin(client, url)) {
        log_w("ota: begin failed");
        return false;
    }

    const int code = http.GET();
    if (code != 200) {
        log_w("ota: manifest HTTP %d", code);
        http.end();
        return false;
    }

    JsonDocument doc;
    const String body = http.getString();
    http.end();

    if (deserializeJson(doc, body)) {
        log_w("ota: manifest JSON parse failed");
        return false;
    }

    out->version    = String((const char*)doc["version"]);
    out->binaryUrl  = String((const char*)doc["url"]);
    out->sha256     = String((const char*)(doc["sha256"] | ""));
    out->mandatory  = doc["mandatory"] | false;
    return !out->version.isEmpty() && !out->binaryUrl.isEmpty();
}

bool shouldApply(const String& currentVersion, const Manifest& m) {
    String cur = currentVersion;
    String nxt = m.version;
    if (!versionStrip(cur) || !versionStrip(nxt)) return false;
    if (m.mandatory) return cur != nxt;
    return nxt > cur;  // lexicographic — fine for monotonic v0.X.Y
}

bool applyUpdate(const Manifest& m) {
    log_w("ota: applying %s from %s", m.version.c_str(), m.binaryUrl.c_str());

    esp_http_client_config_t httpCfg = {};
    httpCfg.url = m.binaryUrl.c_str();
    httpCfg.timeout_ms = 30000;
    httpCfg.keep_alive_enable = true;
    httpCfg.skip_cert_common_name_check = true;  // TODO: pin

    esp_https_ota_config_t otaCfg = {};
    otaCfg.http_config = &httpCfg;

    const esp_err_t result = esp_https_ota(&otaCfg);
    if (result != ESP_OK) {
        log_e("ota: esp_https_ota failed (%d)", result);
        return false;
    }

    log_w("ota: success — rebooting into %s", m.version.c_str());
    delay(500);
    esp_restart();
    return true;  // unreachable
}

void checkAndApply(const String& model, const String& channel) {
    Manifest m;
    char current[16];
    snprintf(current, sizeof(current), "v%d.%d", FW_MAJOR, FW_MINOR);
    if (!fetchManifest(model, channel, current, &m)) return;
    if (!shouldApply(current, m)) {
        log_i("ota: up to date (%s)", current);
        return;
    }
    applyUpdate(m);  // reboots on success
}

void markRunningImageGood() {
    const esp_partition_t* running = esp_ota_get_running_partition();
    esp_ota_img_states_t state;
    if (esp_ota_get_state_partition(running, &state) != ESP_OK) return;
    if (state == ESP_OTA_IMG_PENDING_VERIFY) {
        esp_ota_mark_app_valid_cancel_rollback();
        log_i("ota: marked running image as good");
    }
}

}  // namespace Ota
