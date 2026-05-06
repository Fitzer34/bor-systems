# BOR Systems — Mobile App (iOS + Android)

Expo (React Native) + TypeScript. Single codebase for both platforms.

## Planned views

- Login.
- On/off-duty toggle (off-duty users receive nothing).
- Active alerts list (newest first).
- Alert detail with "I'm on it", "Sign damaged", "Sign missing".
- Floor plan view (when a plan is uploaded for the alert's floor).
- Settings: notification preferences, language (UK English default, downloadable language packs).

## Push

Firebase Cloud Messaging for both platforms. Token registered with the backend on login.

## Status

Not scaffolded yet. Next turn: `npx create-expo-app@latest .` with the TypeScript template, add expo-notifications, wire the backend client, ship a login + alerts list.
