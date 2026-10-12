# TORQWISE iPhone release roadmap

## Stage 1 — Developer prototype (completed)
- [x] Dedicated Expo / React Native project isolated under `mobile/`
- [x] Home, Diagnose, VIN and Garage navigation
- [x] Starter generic-code guidance with diagnostic safety caveats
- [x] VIN decoding through NHTSA vPIC
- [x] Local vehicle garage persistence
- [x] Runtime loader for the website's generic DTC JSON, local cache and starter fallback
- [x] Local diagnostic case history with save, reopen, delete, timestamp, and a 100-case cap
- [x] User-facing retry action and error state when the hosted diagnostic library cannot be refreshed
- [x] CI type-check, iOS JavaScript bundle export and Expo config validation

## Stage 2 — Core product reliability (in progress)
- [x] Add a detailed app-versus-website feature-parity matrix with current status and acceptance tests (`mobile/FEATURE-PARITY.md`).
- [x] Add a native Tools screen for parts-price searches, OEM reference searches, estimate-review preparation, recall/service searches, maintenance-planning prompts, and used-vehicle pre-purchase research. These are initial mobile workflows, not yet full parity with every website flow.
- [x] Add a 60-second timeout, bounded input payloads and clear network/timeout/unreadable-response errors to native AI research.
- [x] Configure EAS Android preview builds to produce an installable APK and production builds to produce an Android App Bundle; this config still requires a real cloud build and device install test.
- [ ] Verify the deployed site serves `/assets/dtc-database.json`; test actual iPhone network behavior and the 9,000-record threshold.
- [ ] Add a complete connection state that clearly distinguishes fresh, cached, and starter data and records the last successful library sync.
- [ ] Add automated tests for VIN validation, DTC normalization, malformed data, cache corruption, offline behavior, and native research response parsing.
- [ ] Add vehicle association and export for saved diagnostic cases after core local persistence is device-tested.
- [x] Add optional technician notes (test results, measurements, symptoms) to locally saved diagnostic cases.
- [ ] Validate long diagnostic content on smaller iPhones, including keyboard dismissal and scrolling.
- [ ] Add user-friendly errors for invalid VINs, network timeouts, empty search results and storage failures.

## Stage 3 — Account and paid-product integration (in progress)
- [x] Inspect the existing web authentication model and choose a compatible native sign-in flow.
- [x] Add native email/password sign-in and account creation using the existing public Supabase configuration, with session tokens stored through platform secure storage.
- [ ] Test secure session persistence, sign-out, token refresh, expired sessions, and email-confirmation flows on physical iOS and Android devices.
- [ ] Sync garage and case history only after sign-in, with clear offline behavior and conflict handling.
- [x] Connect native AI research through the existing server-side endpoint using the signed-in user's access token; never ship OpenAI keys or Supabase service-role secrets in the binary.
- [ ] Test research quota enforcement, timeout/error paths, and source-link rendering on physical devices.
- [ ] Enforce subscription entitlements server-side, not only with a client-side switch.
- [ ] Confirm whether native digital subscriptions must use StoreKit / Apple's in-app purchase flow. Do not enable web checkout in the iOS app until the applicable Apple rules have been reviewed.

## Stage 4 — Privacy, accessibility and review
- [ ] Review and publish the privacy policy and support page with real contact details after confirming production data flows.
- [ ] Complete App Store Connect privacy labels based on actual network traffic, SDKs, identifiers, analytics and account data.
- [x] Add in-app privacy-policy access and a confirmation-protected action to clear local garage and diagnostic-case data.
- [ ] Implement and test in-app account deletion for server-side account data; the current clear-data control only removes local garage entries and saved diagnostic cases.
- [ ] Review VoiceOver labels, Dynamic Type, contrast, keyboard behavior, reduced motion and touch target sizes.
- [ ] Create final app icon, launch screen, screenshots for required device sizes, subtitle, description, keywords and support URL.
- [ ] Test on physical iPhones across supported iOS versions: fresh install, upgrade, offline, poor connectivity, API failures, privacy permissions and subscription restore.
- [ ] Confirm ownership/availability of bundle ID `ca.torqwise.automotive` and set production app metadata.
- [ ] Confirm Apple Developer Program membership, App Store Connect app record and signing credentials.
- [ ] Confirm Google Play Console developer account, package-name availability, signing, data-safety form and testing track.

## Stage 5 — TestFlight and release
1. Build a signed internal preview and install it on a real iPhone.
2. Run a structured acceptance test and fix every release-blocking issue.
3. Upload a production build to App Store Connect.
4. Invite internal TestFlight testers, then external testers if useful.
5. Complete App Review details, export compliance and privacy disclosures.
6. Submit for App Review only after the release checklist is complete.

From `mobile/`, once Expo and Apple credentials are configured:

```sh
npx eas-cli build --platform ios --profile preview
npx eas-cli build --platform ios --profile production
```

A successful JavaScript bundle or cloud build is not the same as a signed, device-tested, App Store-approved release.

## Known limitations — do not treat as complete
- The app has not yet been signed, installed on a physical iPhone/Android device, submitted to TestFlight/Google Play testing, or reviewed by either store.
- The generic DTC dataset is downloaded at runtime from the production website. If the deployed site does not serve it correctly, only the starter codes are available.
- Native account sign-in and AI research are wired to existing services but still require physical-device acceptance testing; the native Tools screen is an initial implementation. Cloud history, several website workflows, and complete feature parity/paid entitlement integration are not yet complete.
- The bundle identifier is provisional until ownership and availability are confirmed.
- The owner must configure their own Apple Developer and Expo accounts. No credentials belong in this repository.
