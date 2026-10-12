# TORQWISE App ↔ Website Feature-Parity Checklist

## Product contract
The native iOS/Android app and the website are separate clients with separate layouts and release cycles. Customers must be able to use either client independently. Neither should require opening the other to use its core features.

The clients should have equivalent **entitlements and core service availability**, not necessarily identical screen layouts. They must share secure server-side authentication, usage limits, subscription entitlements, and current diagnostic/research sources where needed. Separate front ends do not mean separate subscription records or duplicated, diverging datasets.

## Current implementation snapshot

| Capability | Website | Native app | Status / release requirement |
|---|---|---|---|
| Account sign-in | Existing Supabase web flow | Supabase email/password with secure session storage | Wired; device-test session persistence, email confirmation, refresh, expiry, sign-out |
| Free/paid research entitlement | Server-enforced by research endpoint | Calls same research endpoint with user token | Partial; verify exact mapping for every plan and quota/error responses |
| Generic OBD-II lookup | Website data bundle and diagnostic UI | Downloads website DTC JSON, caches locally, starter fallback; shows live vs cached vs starter status and last successful sync | Partial; verify deployed asset path, record count, parity, last-sync/offline status on real devices |
| VIN decoding | NHTSA vPIC integration | NHTSA vPIC integration | Similar core path; test invalid VIN, timeouts, malformed response and readable result |
| AI technical research | Existing website research workflow | Native Research screen via server endpoint with 60-second timeout, bounded request fields, readable timeout/network/JSON errors | Partial; verify equivalent request fields, sources, report output, limits and error states on devices |
| Parts finder / price comparison | Website supplier search and pilot request flows | Native Tools screen with supplier search and AI research hand-off | Partial; native search is a starting point, not parity with the website request/quote workflow |
| Estimate comparison | Website request workflow | Native Tools can prepare an AI research prompt | Not equivalent yet; map the website's complete form, pricing/quote disclosures and saved request state |
| Used-vehicle research | Website service request | Native buyer research brief through AI Research | Partial; research prompt is implemented, but not equivalent to the full website request/quote workflow |
| Service manuals, diagrams, specifications, bulletins | Website research categories and external search tools | Native Tools searches plus AI research categories | Partial; verify identical categories and source-handling, do not claim verified coverage without testing |
| Garage and maintenance history | Website/local and account-history features vary by workflow | Device-local garage and diagnostic cases | Not equivalent; native history does not sync and maintenance schedules are not yet a dedicated record feature |
| Saved cases / account history | Website has existing account-history hooks | Local-only native diagnostic cases | Not equivalent; define cloud-sync ownership, merge, export and offline behavior before claiming parity |
| Subscription management | Existing website billing/portal | No native purchase/restore flow yet | Release blocker; preserve website billing and implement a policy-compliant native entitlement/purchase approach |
| Account deletion / privacy | Website process must be verified | Local data clearing only | Release blocker; local clearing is not account deletion |
| Offline access | Website needs network | Cached DTC data and local cases can work locally | Partial; explicitly distinguish fresh/cached/starter database and unavailable server research |
| Accessibility | Website implementation must be audited | Native touch targets and screen-reader labels started | Partial; test VoiceOver/TalkBack, Dynamic Type, contrast, keyboard, small screens |

## Shared rules
- Never decide paid access from a client-side boolean alone. Server responses remain authoritative.
- Never ship OpenAI or Supabase service-role secrets in either client.
- A customer should use the same account and get the same server-authorized plan benefits on either platform.
- Do not imply that the website is required to unlock features in the app.
- When a service is unavailable, show a clear state and retry path; do not silently replace full data with a tiny starter set.
- Diagnostic and repair content is guidance; confirm vehicle/serial applicability against authoritative service information.

## Acceptance checklist before calling parity complete
- [ ] Inventory every website feature and classify it as free, each paid tier, one-time purchase/service, admin-only, or informational.
- [ ] Create a tested entitlement table for every tier and enforce it on the server.
- [ ] Test free limits and paid access with representative accounts on both clients, including exhausted quota, canceled subscription, expired session, failed payment and restored entitlement.
- [ ] Compare representative DTC records and diagnostic steps across web/app; assert record count and last successful data sync. (Native status now distinguishes fresh, cached and starter data and retains the last successful sync timestamp.)
- [ ] Compare VIN results for valid, invalid, unsupported, timed-out and malformed responses.
- [ ] Compare research report content, source links, usage counters, timeout behavior and error messages on physical devices (native request bounds and timeout are now implemented).
- [ ] Test parts/estimate/used-vehicle workflows from input through final result, including all quote and payment disclosures.
- [ ] Decide and implement cross-device garage/case history, conflict resolution, export and account deletion.
- [ ] Test each client independently on a fresh install with the other client never opened.
- [ ] Test offline launch, stale cache, reconnect and server outage.
- [ ] Complete accessibility and physical-device tests on iOS and Android.
- [ ] Complete compliant subscription purchase/restore and privacy disclosures before store submission.

## Honest status
The app has a useful native foundation, but it is **not yet feature-equivalent** to the website. The native Tools screen now includes parts-price and OEM-reference searches, estimate-review preparation, recall/service-information searches, maintenance planning, and used-vehicle buyer research. These remain search or research hand-offs rather than full website workflow parity. Keep this document current as each gap is implemented and tested.
