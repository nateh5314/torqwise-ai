# TORQWISE iPhone release roadmap

## Stage 1 — Developer prototype
- [x] Dedicated Expo / React Native project isolated under `mobile/`
- [x] Native-feeling Home, Diagnose, VIN and Garage navigation
- [x] Starter generic-code guidance and safety caveats
- [x] VIN decoding via NHTSA vPIC
- [x] Local vehicle garage persistence
- [x] Attempt to load the website's validated generic DTC JSON, cache it on device, and fall back gracefully when unavailable
- [x] CI type-check and iOS JavaScript bundle validation

## Stage 2 — Product integration
- [ ] Verify that the current production website serves `/assets/dtc-database.json` and that the native app can load it successfully.
- [ ] Integrate sign-in with the existing account service using secure token storage and tested session expiry behavior.
- [ ] Sync garage, saved diagnostic cases, and research history to the signed-in user's account.
- [ ] Integrate the AI research endpoint through server-side APIs only; never ship OpenAI or Supabase service-role secrets in the app.
- [ ] Add request timeouts, retry states, rate limits, analytics consent, and graceful offline behavior.
- [ ] Add automated tests for VIN validation, DTC parsing, and storage behavior.

## Stage 3 — Quality and compliance
- [ ] Review all app screens with VoiceOver and Dynamic Type; verify touch targets, contrast, keyboard behavior, and iPhone safe areas.
- [ ] Add final app icon, launch assets, support contact, privacy policy, terms, and App Store screenshots.
- [ ] Complete App Privacy disclosures and data-retention / account-deletion workflows.
- [ ] Decide the subscription strategy. Paid digital features may be subject to Apple's in-app purchase rules; validate the correct approach before accepting payments in the app.
- [ ] Test on multiple physical iPhone sizes and iOS versions, including offline, API failures, expired sessions, and poor connectivity.
- [ ] Confirm bundle ID ownership, Apple Developer account, App Store Connect app record, and signing credentials.

## Stage 4 — TestFlight and release
Run from the `mobile/` directory after signing in to an Expo account and confirming the bundle identifier:
```sh
npx eas-cli build --platform ios --profile preview
```

For an App Store Connect / TestFlight distribution build:
```sh
npx eas-cli build --platform ios --profile production
```

Submission can then be performed with EAS Submit or Xcode/App Store Connect once Apple signing and account details are configured. A successful build does not guarantee App Review approval.

## Current limitations
The native DTC screen currently retrieves the generic reference dataset from the existing website at runtime rather than embedding the multi-megabyte dataset inside the app binary. It checks for at least 9,000 valid records and caches a normalized version on-device. If the current deployed website is unavailable or doesn't serve that file, the app uses its small built-in starter set and shows a clear status.

This is a development app, not yet a released or App Store-submitted product. The build profile configuration does not include any credentials and cannot sign or submit the app until the owner's Apple / Expo accounts are configured.