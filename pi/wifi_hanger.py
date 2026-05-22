#!/usr/bin/env python3
"""
Zero Slip Systems — WiFi-mode hanger daemon.

Runs on a Raspberry Pi that is mounted *in/on the hanger itself*. Reads a
microswitch on GPIO, drives status LEDs, and sends events directly to the
cloud backend's TTS webhook over HTTPS.

Same wire-protocol as the LoRaWAN hangers (4-byte payload), so the cloud
backend doesn't care whether an event arrived via LoRa or WiFi.

  Pin map (BCM numbering):
    GPIO 17  — microswitch         (closed = sign present, open = sign lifted)
    GPIO 22  — red LED             (lit while sign is off the hanger)
    GPIO 27  — green LED           (lit while cleaning is in progress;
                                    also flashes for 5s on a test press
                                    when no alert is open)
    GPIO 23  — "I'm cleaning" button (momentary, pull-up)
                                    pressed while sign is lifted → sends
                                    cleaning_started, supervisor gets pushed
    GPIO 24  — buzzer    (optional)

  Required env vars (placed in /etc/bor-hanger.env by install.py):
    HANGER_DEVEUI   — 16 hex chars unique to this hanger
    BOR_WEBHOOK_URL — e.g. https://bor-systems-backend.onrender.com/webhook/tts
    BOR_TTS_SECRET  — the X-BOR-Secret header value (from Render env vars)

  Optional:
    HEARTBEAT_INTERVAL — seconds between heartbeats (default 86400 = 24h)
    BUZZER_ENABLED     — "true"/"false" (default false)
"""

from __future__ import annotations

import base64
import logging
import os
import signal
import sys
import threading
import time
from dataclasses import dataclass

import requests

# --- Event-type codes — must match shared/payload.ts and the firmware ---
EVT_LIFTED = 0x01
EVT_RETURNED = 0x02
EVT_HEARTBEAT = 0x03
EVT_LOW_BATTERY = 0x04
# Cleaner pressed the physical button on the hanger while the sign is lifted.
EVT_CLEANING_STARTED = 0x05

# --- Logging ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("bor-hanger")


# --- Config (resolved at startup) ---
@dataclass
class Config:
    dev_eui: str
    webhook_url: str
    tts_secret: str
    heartbeat_seconds: int
    buzzer_enabled: bool


def load_config() -> Config:
    missing = []
    dev_eui = os.environ.get("HANGER_DEVEUI", "").strip().upper()
    webhook = os.environ.get("BOR_WEBHOOK_URL", "").strip()
    secret = os.environ.get("BOR_TTS_SECRET", "").strip()
    if not dev_eui or len(dev_eui) != 16:
        missing.append("HANGER_DEVEUI (must be exactly 16 hex characters)")
    if not webhook:
        missing.append("BOR_WEBHOOK_URL")
    if not secret:
        missing.append("BOR_TTS_SECRET")
    if missing:
        sys.exit("Missing required env vars:\n  - " + "\n  - ".join(missing))
    return Config(
        dev_eui=dev_eui,
        webhook_url=webhook,
        tts_secret=secret,
        # WiFi-Pi hangers are mains-powered, so we can afford a very frequent
        # heartbeat to drive a near-instant online/offline indicator on the
        # dashboard. 5 seconds combined with a 15-second offline threshold
        # gives a worst-case ~16s detection lag. Battery-powered LoRa hangers
        # use a separate firmware that defaults to a 24h heartbeat to preserve
        # battery.
        heartbeat_seconds=int(os.environ.get("HEARTBEAT_INTERVAL", "5")),
        buzzer_enabled=os.environ.get("BUZZER_ENABLED", "false").lower() == "true",
    )


# --- Payload encoding (same as firmware/shared/payload.ts) ---
def encode_payload(event_type: int, battery_pct: int = 100, fw_major: int = 0, fw_minor: int = 1, test_button: bool = False) -> str:
    """Base64-encoded 4-byte LoRaWAN-shaped payload."""
    fw_byte = ((fw_major & 0x0F) << 4) | (fw_minor & 0x0F)
    flags = 0x01 if test_button else 0x00
    raw = bytes([event_type & 0xFF, max(0, min(100, battery_pct)), fw_byte, flags])
    return base64.b64encode(raw).decode("ascii")


# --- HTTPS uplink to cloud backend ---
def send_uplink(cfg: Config, event_type: int, battery_pct: int = 100, test_button: bool = False) -> bool:
    body = {
        "end_device_ids": {"dev_eui": cfg.dev_eui},
        "uplink_message": {
            "f_port": 1,
            "frm_payload": encode_payload(event_type, battery_pct, test_button=test_button),
        },
    }
    headers = {"Content-Type": "application/json", "X-BOR-Secret": cfg.tts_secret}
    for attempt in range(1, 4):
        try:
            r = requests.post(cfg.webhook_url, json=body, headers=headers, timeout=15)
            if r.ok:
                log.info("uplink event=0x%02x ok (%s)", event_type, r.text[:80])
                return True
            log.warning("uplink event=0x%02x HTTP %s: %s", event_type, r.status_code, r.text[:120])
        except requests.RequestException as e:
            log.warning("uplink event=0x%02x attempt %d failed: %s", event_type, attempt, e)
        time.sleep(2 ** attempt)
    log.error("uplink event=0x%02x giving up after 3 attempts", event_type)
    return False


# --- GPIO state machine ---
class HangerState:
    """Drives the LEDs and dispatches events based on microswitch + test button."""

    def __init__(self, cfg: Config):
        self.cfg = cfg
        # gpiozero is the recommended high-level GPIO library on Pi 5.
        # Import lazily so this script can be linted on a non-Pi machine.
        from gpiozero import Button, LED, Buzzer  # noqa: WPS433
        from gpiozero.pins.lgpio import LGPIOFactory  # noqa: WPS433
        from gpiozero import Device  # noqa: WPS433
        try:
            Device.pin_factory = LGPIOFactory()
        except Exception:
            log.warning("falling back to default pin factory")

        self.microswitch = Button(17, pull_up=True, bounce_time=0.05)
        self.test_button = Button(23, pull_up=True, bounce_time=0.05)
        self.led_red = LED(22)
        self.led_green = LED(27)
        self.buzzer = Buzzer(24) if cfg.buzzer_enabled else None

        self.test_button_pressed_since_last_uplink = False
        self.lock = threading.Lock()

        # Track what state the cloud thinks we're in so we can reconcile if
        # the microswitch has drifted (e.g. sign wasn't seated firmly so the
        # `_on_sign_returned` callback never fired, or a one-off transient
        # got lost). `None` means "we haven't sent any sign-state event yet,
        # the next heartbeat will report whatever the switch reads."
        self.last_reported_sign_present: bool | None = None

        # Wire up callbacks
        self.microswitch.when_pressed = self._on_sign_returned   # closed circuit = present
        self.microswitch.when_released = self._on_sign_lifted    # open = lifted off
        self.test_button.when_pressed = self._on_test_button

        # Initial state
        self._sync_leds()
        log.info("initial microswitch state: %s",
                 "sign present" if self.microswitch.is_pressed else "sign LIFTED")

    def _sync_leds(self) -> None:
        if self.microswitch.is_pressed:
            self.led_red.off()
        else:
            self.led_red.on()

    def _on_sign_lifted(self) -> None:
        # If the cleaner pressed the button first (green LED on) then this
        # is a planned cleaning lift, not a spill — DON'T light the red
        # warning LED or fire the buzzer. Cloud-side, openAlertForHanger
        # sees the existing planned_cleaning alert and absorbs the event,
        # so no spill push goes out either.
        if self.led_green.is_lit:
            log.info("microswitch opened → sign lifted (planned cleaning, suppressing alert UI)")
        else:
            log.info("microswitch opened → sign lifted")
            self.led_red.on()
            if self.cfg.buzzer_enabled and self.buzzer:
                self.buzzer.beep(on_time=0.2, off_time=0.0, n=1, background=True)
        with self.lock:
            ok = send_uplink(self.cfg, EVT_LIFTED,
                             test_button=self.test_button_pressed_since_last_uplink)
            self.test_button_pressed_since_last_uplink = False
            if ok:
                self.last_reported_sign_present = False

    def _on_sign_returned(self) -> None:
        log.info("microswitch closed → sign returned")
        self.led_red.off()
        # Sign back on the hanger means any cleaning session is done too —
        # snap the green LED off so the cleaner doesn't have to remember
        # to press the button a second time after they finish.
        self.led_green.off()
        with self.lock:
            ok = send_uplink(self.cfg, EVT_RETURNED,
                             test_button=self.test_button_pressed_since_last_uplink)
            self.test_button_pressed_since_last_uplink = False
            if ok:
                self.last_reported_sign_present = True

    def _on_test_button(self) -> None:
        """Cleaner pressed the button on the front of the hanger.

        Single press = start cleaning mode. The cleaning session only ends
        when the sign is replaced on the hanger (microswitch closes →
        `_on_sign_returned` fires → green LED off and alert closed in the
        cloud). No toggle, no second press needed.
        """
        self.test_button_pressed_since_last_uplink = True
        log.info("button pressed — cleaning mode on")
        # Light the green LED and leave it on. _on_sign_returned will clear
        # it when the cleaner finishes.
        self.led_green.on()
        with self.lock:
            send_uplink(self.cfg, EVT_CLEANING_STARTED,
                        test_button=self.test_button_pressed_since_last_uplink)
            self.test_button_pressed_since_last_uplink = False

    def heartbeat_loop(self) -> None:
        while True:
            time.sleep(self.cfg.heartbeat_seconds)
            with self.lock:
                # Reconcile sign state on every heartbeat. Two cases:
                #   - First-ever heartbeat (no transition has fired yet) →
                #     declare current state so the cloud has a starting point.
                #   - State drift (cloud's view doesn't match reality, e.g.
                #     because a transition got lost or the sign was seated
                #     too lightly to register a close) → send a corrective
                #     transition event.
                actually_present = self.microswitch.is_pressed
                needs_correction = (
                    self.last_reported_sign_present is None
                    or actually_present != self.last_reported_sign_present
                )
                if needs_correction:
                    corrective = EVT_RETURNED if actually_present else EVT_LIFTED
                    log.info(
                        "state %s — sending %s before heartbeat (switch reads %s)",
                        "init" if self.last_reported_sign_present is None else "drift",
                        "returned" if actually_present else "lifted",
                        "present" if actually_present else "lifted",
                    )
                    if send_uplink(self.cfg, corrective):
                        self.last_reported_sign_present = actually_present

                send_uplink(self.cfg, EVT_HEARTBEAT)


def main() -> None:
    cfg = load_config()
    log.info("BOR WiFi hanger starting  dev_eui=%s  webhook=%s",
             cfg.dev_eui, cfg.webhook_url)

    state = HangerState(cfg)

    # Send one heartbeat at startup so the cloud knows we came online.
    threading.Thread(target=lambda: send_uplink(cfg, EVT_HEARTBEAT), daemon=True).start()

    # Periodic heartbeat in the background
    threading.Thread(target=state.heartbeat_loop, daemon=True).start()

    # Block until SIGTERM/Ctrl-C
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    log.info("running. Ctrl-C to quit.")
    stop.wait()
    log.info("shutting down.")


if __name__ == "__main__":
    main()
