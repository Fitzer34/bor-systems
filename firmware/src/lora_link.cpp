#include "lora_link.h"
#include "config/nvs_store.h"
#include "../include/pinout.h"

#include <Arduino.h>
#include <RadioLib.h>

namespace {

// 12-byte payload (binary, big-endian):
//   [0]    event_type  (1 B)
//   [1]    battery_pct (1 B, 0–100)
//   [2]    flags       (1 B, see LoraLink::Flags)
//   [3]    fw_version  (1 B, packed major/minor 4+4)
//   [4..11] DevEUI suffix (8 ASCII hex chars — last 8 of the 16-char DevEUI)
//
// 12 bytes at SF9/125kHz/CR4-5 ≈ 600 ms airtime. Well under EU868 1% duty
// cycle limit even at full hanger fleet.
constexpr size_t PAYLOAD_LEN = 12;

SX1262 radio = new Module(Pinout::LORA_NSS, Pinout::LORA_DIO1,
                          Pinout::LORA_RST, Pinout::LORA_BUSY);

volatile bool rxFlag = false;

void IRAM_ATTR onDio1() {
    rxFlag = true;
}

uint8_t packedFwVersion() {
    return ((FW_MAJOR & 0x0F) << 4) | (FW_MINOR & 0x0F);
}

}  // namespace

namespace LoraLink {

bool begin() {
    SPI.begin(Pinout::LORA_SCK, Pinout::LORA_MISO,
              Pinout::LORA_MOSI, Pinout::LORA_NSS);

    const int state = radio.begin(
        LORA_FREQ_HZ / 1e6,        // MHz
        LORA_BANDWIDTH_KHZ,
        LORA_SPREADING_FACTOR,
        LORA_CODING_RATE,
        0x12,                       // sync word — private, not LoRaWAN
        LORA_TX_POWER_DBM,
        8                            // preamble symbols
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
    return true;
}

bool sendEvent(EventType type, uint8_t batteryPct, uint8_t flags) {
    uint8_t payload[PAYLOAD_LEN] = {0};
    payload[0] = static_cast<uint8_t>(type);
    payload[1] = batteryPct;
    payload[2] = flags;
    payload[3] = packedFwVersion();

    // Last 8 hex chars of DevEUI = unique routing tag.
    const String devEui = Config::getDevEui();
    const String tail   = devEui.length() >= 8
                              ? devEui.substring(devEui.length() - 8)
                              : devEui;
    memcpy(&payload[4], tail.c_str(), min((size_t)8, tail.length()));

    const int state = radio.transmit(payload, PAYLOAD_LEN);
    if (state != RADIOLIB_ERR_NONE) {
        log_w("LoRa tx failed: %d", state);
        radio.sleep();
        return false;
    }

    log_i("LoRa tx ok — evt=%d batt=%d%% flags=%02x",
          (int)type, batteryPct, flags);
    radio.sleep();
    return true;
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
    if (!rxFlag) return false;
    rxFlag = false;

    uint8_t buf[PAYLOAD_LEN] = {0};
    const int state = radio.readData(buf, PAYLOAD_LEN);
    radio.startReceive();  // immediately re-arm for next packet

    if (state != RADIOLIB_ERR_NONE) {
        log_w("LoRa rx error: %d", state);
        return false;
    }

    out->type       = static_cast<EventType>(buf[0]);
    out->batteryPct = buf[1];
    out->flags      = buf[2];
    out->fwVersion  = buf[3];
    memcpy(out->devEui, &buf[4], 8);
    out->devEui[8]  = 0;
    out->rssi       = radio.getRSSI();
    out->snr        = radio.getSNR();

    log_i("LoRa rx — evt=%d batt=%d%% deveui=…%s rssi=%.0f snr=%.1f",
          (int)out->type, out->batteryPct, out->devEui, out->rssi, out->snr);
    return true;
}

}  // namespace LoraLink
