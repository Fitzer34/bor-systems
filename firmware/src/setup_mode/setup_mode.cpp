#include "setup_mode.h"
#include "../config/nvs_store.h"
#include "../display.h"

#include <Arduino.h>
#include <NimBLEDevice.h>
#include <WiFi.h>
#include <esp_mac.h>

namespace {

// ─── GATT UUIDs — MUST match iOS HangerSetupView + pi/setup_mode.py ─────────
constexpr const char* SERVICE_UUID = "b08e0001-d4e2-4f5a-9c01-3f25d3a7c2a1";
constexpr const char* CHR_SSID     = "b08e0002-d4e2-4f5a-9c01-3f25d3a7c2a1";  // write
constexpr const char* CHR_PASSWORD = "b08e0003-d4e2-4f5a-9c01-3f25d3a7c2a1";  // write
constexpr const char* CHR_COMMIT   = "b08e0004-d4e2-4f5a-9c01-3f25d3a7c2a1";  // write
constexpr const char* CHR_STATUS   = "b08e0005-d4e2-4f5a-9c01-3f25d3a7c2a1";  // read + notify
constexpr const char* CHR_DEVEUI   = "b08e0006-d4e2-4f5a-9c01-3f25d3a7c2a1";  // read

// Status string sent back over the STATUS characteristic. iOS displays it
// directly in the wizard UI ("Connecting…", "Connected", "Failed: bad PIN").
String g_status = "ready";

// Pending credentials held across writes (SSID then password then commit).
String g_pendingSsid;
String g_pendingPassword;

// Set true from the COMMIT callback to signal run() to try the join.
volatile bool g_commitFlag = false;
volatile bool g_clientDoneFlag = false;

NimBLECharacteristic* g_statusChar = nullptr;

void publishStatus(const String& s) {
    g_status = s;
    if (g_statusChar) {
        g_statusChar->setValue(g_status.c_str());
        g_statusChar->notify();
    }
    log_i("status -> %s", g_status.c_str());
}

// ─── Characteristic write callbacks ─────────────────────────────────────────

class SsidCb : public NimBLECharacteristicCallbacks {
    void onWrite(NimBLECharacteristic* c) override {
        g_pendingSsid = c->getValue().c_str();
        log_i("SSID received (%d chars)", g_pendingSsid.length());
    }
};

class PasswordCb : public NimBLECharacteristicCallbacks {
    void onWrite(NimBLECharacteristic* c) override {
        g_pendingPassword = c->getValue().c_str();
        log_i("password received (%d chars)", g_pendingPassword.length());
    }
};

class CommitCb : public NimBLECharacteristicCallbacks {
    void onWrite(NimBLECharacteristic* /*c*/) override {
        log_i("commit received — kicking off Wi-Fi join");
        g_commitFlag = true;
    }
};

// ─── Pairing PIN + device name (deterministic from MAC) ─────────────────────

String macSuffix() {
    uint8_t mac[6] = {0};
    esp_efuse_mac_get_default(mac);
    char buf[5];
    snprintf(buf, sizeof(buf), "%02X%02X", mac[4], mac[5]);
    return String(buf);
}

uint32_t derivePin() {
    uint8_t mac[6] = {0};
    esp_efuse_mac_get_default(mac);
    uint32_t seed = (mac[2] << 24) | (mac[3] << 16) | (mac[4] << 8) | mac[5];
    return (seed * 7919u) % 1000000u;
}

// ─── Wi-Fi join (called from the main loop, NOT a BLE callback) ─────────────

bool tryJoin(const String& ssid, const String& password, String* errOut) {
    WiFi.mode(WIFI_STA);
    WiFi.disconnect(true, true);
    delay(100);
    WiFi.begin(ssid.c_str(), password.c_str());

    const uint32_t start = millis();
    const uint32_t timeoutMs = 45000;
    while (WiFi.status() != WL_CONNECTED) {
        if (millis() - start > timeoutMs) {
            *errOut = "timeout";
            return false;
        }
        if (WiFi.status() == WL_CONNECT_FAILED ||
            WiFi.status() == WL_NO_SSID_AVAIL) {
            *errOut = (WiFi.status() == WL_NO_SSID_AVAIL)
                          ? "ssid_not_found" : "wrong_password";
            return false;
        }
        delay(250);
    }
    log_i("joined Wi-Fi — IP %s", WiFi.localIP().toString().c_str());
    return true;
}

}  // namespace

namespace SetupMode {

String pairingPin() {
    char buf[7];
    snprintf(buf, sizeof(buf), "%06lu", (unsigned long)derivePin());
    return String(buf);
}

String deviceName() {
    // Advertised BLE name. Varies by build so the iPhone app can show only
    // the device class the user asked to add. Wire protocol + GATT UUIDs
    // are identical across all three SKUs — only the human-readable label
    // differs. Brand-aligned to HazardLink (was BOR-*; iOS keeps the old
    // prefixes in its scan filter for backwards compatibility with any
    // earlier-flashed devices still in the field).
#if defined(BOR_MODE_GATEWAY)
    return String("HazardLink-GW-")      + macSuffix();
#elif defined(BOR_MODE_HANGER_WIFI)
    return String("HazardLink-HangerW-") + macSuffix();
#else
    return String("HazardLink-Hanger-")  + macSuffix();
#endif
}

bool run() {
    const String name = deviceName();
    const String pin  = pairingPin();
    log_i("entering BLE setup mode — advertising as %s (PIN %s)",
          name.c_str(), pin.c_str());

    // Show the pairing PIN on the OLED so the customer doesn't need a sticker
    // to read it — vastly better UX for self-install.
    Display::begin();
    Display::showStatus("HazardLink Setup",
                        name,
                        "Pairing PIN:",
                        pin);

    NimBLEDevice::init(name.c_str());

    // Bonded + MITM-protected + encrypted link. Forces iOS to prompt the
    // user for the 6-digit pairing PIN before any write goes through.
    NimBLEDevice::setSecurityAuth(/*bond*/true, /*mitm*/true, /*sc*/true);
    NimBLEDevice::setSecurityIOCap(BLE_HS_IO_DISPLAY_ONLY);
    NimBLEDevice::setSecurityPasskey(derivePin());

    auto* server  = NimBLEDevice::createServer();
    auto* service = server->createService(SERVICE_UUID);

    auto* ssidChar = service->createCharacteristic(
        CHR_SSID,
        NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_ENC | NIMBLE_PROPERTY::WRITE_AUTHEN);
    ssidChar->setCallbacks(new SsidCb());

    auto* passChar = service->createCharacteristic(
        CHR_PASSWORD,
        NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_ENC | NIMBLE_PROPERTY::WRITE_AUTHEN);
    passChar->setCallbacks(new PasswordCb());

    auto* commitChar = service->createCharacteristic(
        CHR_COMMIT,
        NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_ENC | NIMBLE_PROPERTY::WRITE_AUTHEN);
    commitChar->setCallbacks(new CommitCb());

    g_statusChar = service->createCharacteristic(
        CHR_STATUS,
        NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY |
        NIMBLE_PROPERTY::READ_ENC);
    g_statusChar->setValue("ready");

    // DevEUI is readable without pairing — it's printed on the hanger label
    // anyway, the app needs it before pairing to confirm device identity.
    auto* devEuiChar = service->createCharacteristic(
        CHR_DEVEUI, NIMBLE_PROPERTY::READ);
    devEuiChar->setValue(Config::getDevEui().c_str());

    service->start();

    auto* adv = NimBLEDevice::getAdvertising();
    adv->addServiceUUID(SERVICE_UUID);
    adv->setScanResponse(true);
    adv->start();

    log_i("BLE advertising — waiting for iOS connect");

    // Main wait loop. Spin until either:
    //   - a successful commit happens (return true), OR
    //   - the user gives up and powers the unit off (we never return).
    bool ok = false;
    while (true) {
        delay(50);

        if (g_commitFlag) {
            g_commitFlag = false;
            if (g_pendingSsid.isEmpty() || g_pendingPassword.isEmpty()) {
                publishStatus("failed:missing_credentials");
                continue;
            }
            publishStatus("joining");

            String err;
            if (tryJoin(g_pendingSsid, g_pendingPassword, &err)) {
                Config::saveWifiCredentials(g_pendingSsid, g_pendingPassword);
                Config::setOnboarded(true);
                // BLE notify() is fire-and-forget — a single fire can be
                // dropped if the link is briefly busy. Fire the "connected"
                // status across a ~2.5s window so iOS has multiple chances
                // to receive it before we tear BLE down. iOS de-dupes the
                // value (string equality), so re-fires are harmless.
                for (int i = 0; i < 6; ++i) {
                    publishStatus("connected");
                    delay(400);
                }
                ok = true;
                break;
            } else {
                publishStatus(String("failed:") + err);
                // Stay in setup mode so the user can try again with a fixed
                // password without rebooting.
            }
        }
    }

    NimBLEDevice::deinit(/*clearAll=*/true);
    Display::showStatus("Setup complete", "Wi-Fi connected", "", "");
    delay(2000);
    Display::off();
    log_i("BLE setup mode complete — Wi-Fi ready");
    return ok;
}

}  // namespace SetupMode
