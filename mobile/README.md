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
