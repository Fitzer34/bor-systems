// BOR Systems — hanger firmware sketch (RAK3172 / STM32WLE5).
// LoRaWAN join + send calls are placeholders; fill in against RUI3 SDK or LMIC
// once hardware is on hand. Keep payload encoding in sync with shared/payload.ts.

#include <Arduino.h>

constexpr uint8_t PIN_MICROSWITCH = PA0;
constexpr uint8_t PIN_TEST_BTN    = PA1;
constexpr uint8_t PIN_LED_RED     = PB0;
constexpr uint8_t PIN_LED_GREEN   = PB1;
constexpr uint8_t PIN_LED_AMBER   = PB2;
constexpr uint8_t PIN_BUZZER      = PB3;

constexpr uint32_t HEARTBEAT_INTERVAL_MS = 24UL * 60UL * 60UL * 1000UL;
constexpr uint32_t ALERT_RESEND_MS       = 5UL  * 60UL * 1000UL;
constexpr uint8_t  LOW_BATTERY_PCT       = 20;

enum EventType : uint8_t {
  EVT_LIFTED      = 1,
  EVT_RETURNED    = 2,
  EVT_HEARTBEAT   = 3,
  EVT_LOW_BATTERY = 4,
};

enum class State { Idle, Alert };

static State    state                 = State::Idle;
static uint32_t lastHeartbeatMs       = 0;
static uint32_t lastAlertResendMs     = 0;
static bool     testButtonPressedFlag = false;
static bool     audibleAlarmEnabled   = false;

static uint8_t readBatteryPct();        // ADC on VBAT divider (TODO)
static bool    signIsPresent();         // microswitch closed = present
static void    sendUplink(uint8_t evt); // LoRaWAN unconfirmed uplink (TODO)
static void    showTestIndicator();
static void    setAlertLeds(bool on);
static void    sleepUntilEventOrTimer(uint32_t maxMs);

void setup() {
  pinMode(PIN_MICROSWITCH, INPUT_PULLUP);
  pinMode(PIN_TEST_BTN,    INPUT_PULLUP);
  pinMode(PIN_LED_RED,     OUTPUT);
  pinMode(PIN_LED_GREEN,   OUTPUT);
  pinMode(PIN_LED_AMBER,   OUTPUT);
  pinMode(PIN_BUZZER,      OUTPUT);

  // TODO: LoRaWAN OTAA join (RUI3 SDK)

  state = signIsPresent() ? State::Idle : State::Alert;
  if (state == State::Alert) {
    setAlertLeds(true);
    sendUplink(EVT_LIFTED);
    lastAlertResendMs = millis();
  }
  sendUplink(EVT_HEARTBEAT);
  lastHeartbeatMs = millis();
}

void loop() {
  if (digitalRead(PIN_TEST_BTN) == LOW) {
    testButtonPressedFlag = true;
    showTestIndicator();
  }

  const bool present = signIsPresent();
  if (state == State::Idle && !present) {
    state = State::Alert;
    setAlertLeds(true);
    sendUplink(EVT_LIFTED);
    lastAlertResendMs = millis();
    if (audibleAlarmEnabled) tone(PIN_BUZZER, 2000, 200);
  } else if (state == State::Alert && present) {
    state = State::Idle;
    setAlertLeds(false);
    sendUplink(EVT_RETURNED);
  }

  const uint32_t now = millis();
  if (state == State::Alert && now - lastAlertResendMs >= ALERT_RESEND_MS) {
    sendUplink(EVT_LIFTED);
    lastAlertResendMs = now;
  }
  if (now - lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS) {
    sendUplink(readBatteryPct() <= LOW_BATTERY_PCT ? EVT_LOW_BATTERY : EVT_HEARTBEAT);
    lastHeartbeatMs = now;
  }

  sleepUntilEventOrTimer(state == State::Alert ? 60000 : 600000);
}

static bool signIsPresent() {
  return digitalRead(PIN_MICROSWITCH) == LOW;
}

static void setAlertLeds(bool on) {
  digitalWrite(PIN_LED_RED, on ? HIGH : LOW);
}

static void showTestIndicator() {
  const uint8_t pct = readBatteryPct();
  if (pct <= LOW_BATTERY_PCT) {
    for (int i = 0; i < 5; ++i) {
      digitalWrite(PIN_LED_AMBER, HIGH); delay(200);
      digitalWrite(PIN_LED_AMBER, LOW);  delay(200);
    }
  } else {
    digitalWrite(PIN_LED_GREEN, HIGH);
    delay(5000);
    digitalWrite(PIN_LED_GREEN, LOW);
  }
}

static uint8_t readBatteryPct() {
  return 100; // TODO: ADC on VBAT divider with cutoff 2.0 V → 0%, 3.2 V → 100%
}

static void sendUplink(uint8_t evt) {
  uint8_t fw = ((FW_MAJOR & 0x0f) << 4) | (FW_MINOR & 0x0f);
  uint8_t flags = testButtonPressedFlag ? 0x01 : 0x00;
  testButtonPressedFlag = false;
  uint8_t payload[4] = { evt, readBatteryPct(), fw, flags };
  (void)payload;
  // TODO: LoRaWAN unconfirmed uplink, fPort=1
}

static void sleepUntilEventOrTimer(uint32_t maxMs) {
  delay(maxMs); // TODO: replace with STM32WLE5 STOP2 + GPIO/RTC wake
}
