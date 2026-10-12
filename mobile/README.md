# TORQWISE mobile app (iOS-first)

This folder is the dedicated native mobile-app workspace for TORQWISE. It uses Expo + React Native, prioritizing iPhone / App Store readiness while retaining iOS and Android build targets.

## Run locally
Requires Node.js 20+ and npm.

```sh
cd mobile
npm install
npx expo start
```

Scan the QR code with Expo Go on an iPhone, or run `npx expo start --ios` on a Mac with the iOS Simulator installed.

## Prototype features
- Dark, mobile-first TORQWISE interface and bottom-tab navigation
- Starter diagnostic-code lookup with responsible diagnostic caveats
- VIN decoding through NHTSA vPIC
- Device-memory garage list for initial usability testing
- Local diagnostic case history with save, reopen, delete and timestamps
- Retry and error messaging when the hosted diagnostic library cannot be loaded
- Native email/password sign-in and account creation using Supabase with device secure session storage
- Authenticated AI research requests through the existing server-side Netlify endpoint
- Link to the existing full TORQWISE research workspace

## Before App Store / Google Play submission
This is a development foundation, not an App Store-ready release. Connect secure account sign-in and cloud history, add persistent local storage, robust API states, accessibility checks and automated tests, review subscription/payment compliance, finalize app icon/screenshots/privacy disclosures, and test on physical iPhones.

The bundle identifier `ca.torqwise.automotive` is provisional; verify availability/ownership and replace it before the first production build if necessary. Publishing requires Apple's developer tooling and an Apple Developer Program membership. Never put server API keys in the app.

## EAS build profiles

The `eas.json` file defines iOS simulator, internal preview, and production build profiles. After configuring your Expo account and Apple signing details:

```sh
npx eas-cli build --platform ios --profile development
npx eas-cli build --platform ios --profile production
```

See [APP-STORE-ROADMAP.md](./APP-STORE-ROADMAP.md) for the complete release checklist. No Apple, Expo, or API credentials are stored in this repository.


## Build a real test install

The latest repository CI run passed dependency installation, TypeScript type-check, iOS JavaScript bundle export, and Expo configuration validation. This validates the source and JS bundle; it does **not** create a signed installable binary.

### Android preview APK
1. Install Node.js 20+ and enter `mobile/`.
2. Sign in to an Expo account you control: `npx eas-cli login`.
3. Run `npx eas-cli build:configure` if EAS asks to configure the project.
4. Start a preview build: `npm run build:android:preview`.
5. When EAS finishes, use the returned link to install the APK on an Android phone and run the acceptance checklist.

### iPhone TestFlight build
1. You need an active Apple Developer Program membership and access to App Store Connect.
2. Confirm `ca.torqwise.automotive` is available and belongs to your Apple team. Create the App Store Connect app record using the same bundle ID.
3. Sign in to EAS and configure Apple signing credentials when prompted.
4. Run `npm run build:ios:production`.
5. Upload the successful signed build with `npm run submit:ios`, complete App Store Connect privacy, age-rating, export-compliance and review information, then invite yourself as an internal TestFlight tester.

### Before relying on the test build
- Confirm the public Supabase URL and anon key are configured by the public-config endpoint; never bundle a service-role key or OpenAI key.
- Test account creation, email confirmation, sign-in/out, session expiry, AI research limits and paid-plan recognition.
- Test diagnostics online/offline, VIN errors, saved-case export and privacy/account-deletion expectations.
- Complete a proper account-deletion process and subscription purchase/restore compliance before public release.
- Keep production website code separate until native acceptance testing passes.

**Owner-controlled steps remain:** this repository does not contain an Expo login session, Apple signing credentials, or an App Store Connect record. Source-code changes alone cannot create or upload a signed iPhone app.
