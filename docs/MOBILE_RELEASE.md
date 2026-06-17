# Mobile release — TestFlight (iOS) & Play internal testing (Android)

How to ship the native apps. Backend + web deploy from `main` via Render
(see [DEPLOY.md](../DEPLOY.md)); the mobile apps build locally and upload to the
stores. Both store uploads need credentials that are **not** in the repo.

---

## Android → Play Console internal testing

**Signing is already wired up.** `app/build.gradle.kts` reads an upload key from
the gitignored `android/keystore.properties`, which points at
`android/keystores/upload-keystore.jks`.

> ⚠️ **Back up `android/keystores/upload-keystore.jks` and `keystore.properties`
> now, somewhere safe (password manager / secure storage).** It is your Play
> *upload key*. If you lose it you can ask Google to reset it, but every upload
> until then will fail. It is gitignored on purpose — never commit it.

Build a signed bundle:

```sh
cd android
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
  ./gradlew :app:bundleRelease
# → app/build/outputs/bundle/release/app-release.aab
```

Upload (first time is manual):

1. Play Console → create the app (package `com.hazardlink.app`) if it doesn't
   exist. Enrol in **Play App Signing** (recommended) — you keep the upload key,
   Google manages the app signing key.
2. **Testing → Internal testing → Create new release** → upload `app-release.aab`.
3. Add testers (email list), save, **Review release**, **Roll out**.
4. Share the opt-in link with testers; they install via the Play Store.

To automate later: a Play **service-account JSON** (Play Console → Setup → API
access) + `fastlane supply` or the Gradle Play Publisher plugin.

---

## iOS → TestFlight

Scaffolding is in `ios/fastlane/` + `ios/ExportOptions.plist`. The actual upload
needs an **App Store Connect API key** and an app record — neither is in the repo.

One-time setup:

1. **App record**: App Store Connect → Apps → **+** → bundle id
   `com.borsystems.app`.
2. **API key**: App Store Connect → Users and Access → **Integrations** → App
   Store Connect API → generate a key (App Manager role). Download the `.p8`
   **once**. Note the **Key ID** and **Issuer ID**.
3. `brew install fastlane` (or `gem install fastlane`).

Build + upload:

```sh
cd ios
ASC_KEY_ID=XXXXXXXX \
ASC_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx \
ASC_KEY_PATH=/absolute/path/AuthKey_XXXXXXXX.p8 \
  fastlane beta
```

`fastlane beta` bumps the build number, archives with automatic signing
(`-allowProvisioningUpdates` creates the Apple Distribution cert + App Store
profile via the API key — no manual cert wrangling), and uploads to TestFlight.

**Manual alternative** (no fastlane), once a Distribution cert/profile exist:

```sh
cd ios
xcodebuild -project BORSystems.xcodeproj -scheme BORSystems \
  -configuration Release -archivePath build/BORSystems.xcarchive \
  -allowProvisioningUpdates archive
xcodebuild -exportArchive -archivePath build/BORSystems.xcarchive \
  -exportOptionsPlist ExportOptions.plist -exportPath build/export \
  -allowProvisioningUpdates
# then upload build/export/*.ipa via Transporter or `xcrun altool`
```

> Note: the embedded **BORSystemsWatch** target is part of the archive. A signed
> device archive embeds it normally; a `CODE_SIGNING_ALLOWED=NO` *simulator*
> build can fail at the watch-embed step — that's expected and not a code issue.

---

## What this deploy ships

The CSV-export work (web/backend already live on Render) reaches phones through
these app builds. The native apps export **work orders** from the Maintenance
screen via the system share sheet; the backend `/jobs.csv` route they call is
already deployed.
