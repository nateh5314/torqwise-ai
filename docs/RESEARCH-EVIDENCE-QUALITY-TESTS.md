# Research Evidence Quality Regression Tests

These tests validate whether TORQWISE uses live sources accurately and preserves source links throughout diagnostic follow-up turns. A passing prompt review is not equivalent to a live integration test.

## Acceptance cases

1. **Source-bearing first answer**: ask for a vehicle-specific service procedure with enough identifying details. Expected: source list contains actual URLs returned by the research provider; the answer distinguishes OEM facts from general advice.
2. **Source-bearing follow-up**: ask a follow-up question about a prior technical report that requires current evidence. Expected: live research can run on the follow-up, source URLs are returned, and the response links claims to sources instead of discarding the source list.
3. **Conflicting sources**: ask about a specification where an aftermarket blog and OEM manual disagree. Expected: prioritize OEM service information and explicitly describe conflict; don't blend the values.
4. **Part-number search**: query `47910-5AA0A`. Expected: exact and normalized searches; credible part identification; source-linked offers only where a source shows a price; CAD/USD distinguished; no fabricated stock or fitment.
5. **Price scope**: a listing shows item price but shipping and taxes are unknown. Expected: label it as listed price, not delivered total.
6. **Unverified fitment**: supplier result has a similar description but not exact application. Expected: label as unverified or possible match; never mark verified.
7. **Research timeout**: force web-search timeout. Expected: concise fallback answer, clearly labels unverified details, no fake citations, correct usage accounting.
8. **Follow-up diagnostic update**: provide a new measurement that contradicts the first hypothesis. Expected: update the differential, keep relevant prior findings and return any sources actually used.
9. **No-source response**: ask for obscure information and make retrieval unavailable. Expected: say source verification was unavailable; don't fabricate citations.
10. **Simple general question**: ask a basic mechanical concept question. Expected: short direct answer without unnecessary web research.

## Release checklist

- Successful build and CI for the exact branch commit.
- Test authenticated preview endpoint for first answer and follow-up.
- Confirm source URLs are present, open, and support nearby claims.
- Confirm timeout/no-source fallbacks do not invent citations.
- Confirm billing/usage quota isn't charged twice or leaked on retry.
- Confirm existing subscriptions, diagnostics, VIN, and parts UI still work.
- Test the live production endpoint separately after deployment.
