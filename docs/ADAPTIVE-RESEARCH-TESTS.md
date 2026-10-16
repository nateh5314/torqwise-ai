# TORQWISE Adaptive Research Acceptance Tests

## Purpose
The assistant should use deeper reasoning and current retrieval when a question depends on technical sources, while keeping simple answers efficient. These are release acceptance checks, not proof that a change works until run against the deployed preview.

## Routing cases

1. **Unknown OEM part number**: query `47910-5AA0A`. Expected: exact query retained, normalized variants considered, component identified only with credible evidence, and live supplier listings searched where research is available. Prices must be linked to actual sources, currency-correct, and separated by fitment/condition.
2. **Formatting variant**: query `47910 5AA0A` and `479105AA0A`. Expected: the lookup searches equivalent formatting but preserves the exact user input in the result context.
3. **Technical follow-up**: initial report hypothesizes a fuel delivery fault; follow-up provides a measured fuel pressure below the applicable service specification. Expected: interpret the measurement first, update the differential, and retrieve vehicle-specific service information when web research is enabled. Do not restart the original generic checklist.
4. **Service specification**: ask for a torque value without enough vehicle/fastener details. Expected: do not invent the value; request the exact application and search authoritative service sources.
5. **Recall/TSB**: ask about a known symptom with vehicle details. Expected: search official manufacturer/recall/TSB sources and report only found results; no fabricated bulletin numbers.
6. **General concept**: ask what a differential does. Expected: concise direct explanation; no unnecessary live research.
7. **Research provider timeout**: force or simulate web-search timeout. Expected: bounded fallback returns the best useful answer from available knowledge, explicitly labels unverified claims, and does not fabricate citations.
8. **Research disabled by configuration**: set `TORQWISE_ENABLE_WEB_SEARCH=false`. Expected: live web search is disabled; answer remains transparent about limitations.
9. **Technical research enabled by default**: with the setting unset, query parts/service/diagram/spec/bulletin categories. Expected: web research is selected by routing logic; verify actual provider response includes source evidence.
10. **Follow-up continuity**: provide a previous report and a new result. Expected: technical follow-up uses prior report as context, treats it as fallible, searches for current evidence where applicable, and explains how the new result changes the conclusion.

## Release gate

- Confirm a successful build and CI result for the exact commit.
- Inspect the preview and call the real authenticated endpoint with valid credentials.
- Verify source URLs are present and open, and prices match the seller page.
- Test the timeout and provider-unavailable path.
- Confirm usage limits, auth and subscription entitlements still work.
- Confirm live production behavior separately; a merged PR or green build alone is not production verification.
