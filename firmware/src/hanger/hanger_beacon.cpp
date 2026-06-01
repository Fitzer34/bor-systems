#include "hanger_beacon.h"

#include <NimBLEDevice.h>

namespace {

// Dedicated discovery service UUID — DISTINCT from the gateway's WiFi-setup
// service (b08e0001-…). The app scans for THIS uuid to find hangers ready to
// onboard, so hanger discovery and gateway WiFi-setup never cross wires.
constexpr const char* BEACON_SERVICE_UUID = "b08e0010-d4e2-4f5a-9c01-3f25d3a7c2a1";

// Manufacturer-data company ID. 0xFFFF is the Bluetooth SIG "no company /
// testing" value — fine for a private in-house beacon. The 16-char ASCII
// DevEUI follows the 2-byte company ID. The phone reads it straight out of the
// scan result (no connection needed).
constexpr uint16_t COMPANY_ID = 0xFFFF;

bool g_inited = false;
bool g_advertising = false;

}  // namespace

namespace HangerBeacon {

void start(const String& devEui) {
    if (g_advertising) return;   // already broadcasting — nothing to do

    if (!g_inited) {
        // Advertise under a friendly controller name; the real identity the app
        // keys on is the manufacturer-data DevEUI below.
        NimBLEDevice::init("HazardLink-Hanger");
        g_inited = true;
    }

    NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
    adv->stop();
    adv->reset();

    // ── Main advertisement packet: flags + our 128-bit discovery service UUID.
    // The app filters its scan on this UUID so only HazardLink hangers show up.
    NimBLEAdvertisementData advData;
    advData.setFlags(BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP);
    advData.setCompleteServices(NimBLEUUID(BEACON_SERVICE_UUID));
    adv->setAdvertisementData(advData);

    // ── Scan-response packet: manufacturer data = company ID + ASCII DevEUI.
    // Kept here (not the main packet) because the 128-bit UUID already fills
    // most of the 31-byte main packet. iOS merges both packets in one scan
    // callback, so the app sees the DevEUI without ever connecting.
    std::string mfr;
    mfr.push_back(static_cast<char>(COMPANY_ID & 0xFF));         // little-endian
    mfr.push_back(static_cast<char>((COMPANY_ID >> 8) & 0xFF));
    mfr.append(devEui.c_str(), devEui.length());                 // 16 ASCII chars
    NimBLEAdvertisementData scanData;
    scanData.setManufacturerData(mfr);
    adv->setScanResponseData(scanData);

    adv->start();
    g_advertising = true;
    log_i("BLE discovery beacon ON — DevEUI %s", devEui.c_str());
}

void stop() {
    if (!g_inited || !g_advertising) return;
    NimBLEDevice::getAdvertising()->stop();
    g_advertising = false;
    log_i("BLE discovery beacon OFF");
}

}  // namespace HangerBeacon
