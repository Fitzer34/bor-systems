# HazardLink — Customer Install Guide

For new customer sites. Hand-printable as a PDF, also lives at
`hazardlink.com/install`.

Estimated time: **30 minutes per building** (5 hangers, 1 gateway,
1 phone/tablet for the admin).

---

## What's in the box

For a small site (10 hangers, 1 gateway):

- 10× HazardLink sign-hangers (the wall-mounted units)
- 10× HazardLink sign tags (small modules pre-paired to your wet-floor signs)
- 1× HazardLink gateway (the puck that talks to your Wi-Fi)
- 1× 6-port USB-C charging dock (Anker)
- 1× pack of N42 magnets (spares, you won't need them on day 1)
- 1× printed quick-start card (this document)
- USB-C cables for charging

## Before you start

You'll need:
- [ ] Phone or tablet (iOS 16+ or Android 8+)
- [ ] Wi-Fi network name + password for the building
- [ ] A drill + screws for wall-mounting the hangers (M3 × 20mm work fine)
- [ ] 15 minutes to download the HazardLink app on at least one admin phone

---

## Step 1 — Install the app + create your account

1. Open the App Store (iPhone) or Play Store (Android)
2. Search **HazardLink**, install
3. Sign up with your work email — you become the **admin** for your
   organisation by default
4. Add the people who'll respond to alerts (cleaners, supervisors)
   under **More → Users**

## Step 2 — Mount the gateway

The gateway only needs to be installed once per building.

1. Find a central location with Wi-Fi signal + power outlet
   (ceiling cupboard, IT room, supply room work well)
2. Plug in the USB-C cable + power adapter
3. The OLED screen lights up — it shows `BOR-Setup-XXXX` and a
   6-digit pairing PIN
4. Open the HazardLink app → **Hangers** → tap the **+ Add hanger**
   button at the top
5. The app scans for the gateway via Bluetooth — tap it when it
   appears
6. Enter the 6-digit PIN from the OLED screen
7. Type your Wi-Fi network name + password
8. Tap **Send to hanger** — the gateway joins Wi-Fi within 30 seconds

When the OLED shows `Online — 0 hangers paired`, you're done.

## Step 3 — Mount the hangers

For each location where you currently put a wet-floor sign:

1. Decide where the hanger goes — usually the wall above a mop bucket,
   near a hand-wash sink, by a kitchen entrance, etc.
2. The hanger is **150 × 80 × 30 mm** with two screw holes 100mm apart
3. Drill the holes, insert wall plugs, screw the hanger to the wall
4. Press the hanger gently — the OLED on the gateway should tick up
   (`Online — 1 hanger paired`)

If a hanger doesn't pair within 60 seconds:
- Make sure the gateway is online (OLED shows green status)
- Make sure the hanger is within 200m of the gateway
- Try moving the hanger 1m at a time until paired

## Step 4 — Hang your existing signs

Your wet-floor signs already have a magnet embedded in the handle
(we did this when you ordered — the sign tags include a magnet).

1. Take each wet-floor sign and hang it on its corresponding hanger
2. You should hear/feel a soft click as the magnet engages the
   Hall sensor inside the hanger
3. On the app, navigate to **Hangers** — each hanger should show
   **Online ✅ Sign present**

Test it:
1. Lift one sign off the hanger
2. Within 5 seconds, your phone should buzz with a "Sign lifted" alert
3. Tap **I'm on it** to acknowledge
4. Put the sign back — the alert auto-closes within 5 seconds

If the test alert doesn't fire:
- Check the hanger is online in the **Hangers** screen
- Check **Settings → Notifications** is enabled for HazardLink
- Email **support@hazardlink.com** with the hanger ID

## Step 5 — Train your team

Invite each cleaner / supervisor via **More → Users → +**.

What each role sees:

| Role | App permissions |
|---|---|
| **Admin** (you) | Everything: settings, billing, hangers, users, analytics |
| **Supervisor** | Send dispatches, see all alerts, view reports |
| **Cleaner** | Receive alerts, ack/complete dispatches, see their shifts |

Each new user receives an email with a temporary password. They set
their own password on first login.

## Step 6 — Set your SLA thresholds (optional)

The default is:
- 5 minutes to acknowledge an alert
- 15 minutes to resolve

If a cleaner doesn't respond in 5 minutes, the alert auto-escalates
to supervisors. You can change these in **More → Settings**.

For after-hours sites:
- Configure **More → Settings → Night mode** to route alerts to a
  specific person (e.g. your night security guard) outside business hours

## Step 7 — Charging (every 12-18 months)

Hangers run on a 21700 lithium cell — about 12-18 months per charge.
When the dashboard warns "low battery":

1. Pop the cover off the hanger (snap-fit, no tools)
2. Plug a USB-C cable in — the included Anker dock holds 6 at once
3. Leave for 6 hours
4. Reattach to the wall

You don't lose any data during the charge — the gateway buffers events.

## Troubleshooting

**Hanger offline**
- Check the gateway is online
- Cycle the hanger battery (pop cover, briefly remove cell, reinsert)
- If still offline after 5 min, email support

**Alerts arriving late or not at all**
- Phone Wi-Fi or cellular issue — check internet
- Push notifications disabled — check phone Settings
- App backgrounded with restrictive battery saver — disable
  battery optimisation for HazardLink in phone Settings

**Sign "lifted" but cleaner didn't move it**
- Magnetic field disrupted — could be a strong metal object placed
  nearby. Move it away and reset by putting the sign back.

**Can I find a missing sign?**
- Yes — tap **Find sign** on the alert
- If your phone has UWB (iPhone 11+, Pixel 6 Pro+, Galaxy S21 Ultra+)
  you get an arrow + cm-accurate distance
- Otherwise you see the zone pin on the floor plan

## Support

- 📧 **Email**: support@hazardlink.com (within 24h, usually faster)
- 💬 **Live chat**: hazardlink.com/support (business hours, 9-5 Irish time)
- 📞 **Phone (emergencies)**: +353 (0)0 000 0000
- 📄 **Status page**: hazardlink.com/status
