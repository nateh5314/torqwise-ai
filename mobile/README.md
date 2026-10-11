# TORQWISE for iPhone

This folder is the first dedicated mobile-app workspace for TORQWISE. It uses Expo + React Native to focus on iPhone first while preserving a path to Android later.

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
- Link to the existing full TORQWISE research workspace

## Before App Store submission
This is a development foundation, not an App Store-ready release. Connect secure account sign-in and cloud history, add persistent local storage, robust API states, accessibility checks and automated tests, review subscription/payment compliance, finalize app icon/screenshots/privacy disclosures, and test on physical iPhones.

The bundle identifier `ca.torqwise.automotive` is provisional; verify availability/ownership and replace it before the first production build if necessary. Publishing requires Apple's developer tooling and an Apple Developer Program membership. Never put server API keys in the app.

## EAS build profiles

The `eas.json` file defines iOS simulator, internal preview, and production build profiles. After configuring your Expo account and Apple signing details:

```sh
npx eas-cli build --platform ios --profile development
npx eas-cli build --platform ios --profile production
```

See [APP-STORE-ROADMAP.md](./APP-STORE-ROADMAP.md) for the complete release checklist. No Apple, Expo, or API credentials are stored in this repository.
