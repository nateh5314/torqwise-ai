# TORQWISE Universal Parts Intelligence

## Product requirement

Parts Finder must work across the full range of automotive and heavy-equipment parts a technician encounters, not only known entries in a bundled database. The Nissan sensor is one example of the failure class, not a one-off exception.

## Required lookup pipeline

1. **Parse the query**: accept OEM/manufacturer numbers, aftermarket numbers, interchange/cross-reference numbers, descriptions, abbreviations, brand names, dimensions and image/label transcription. Preserve the original query; normalize spaces, hyphens and case for candidate search without discarding the original.
2. **Identify candidates**: search the local catalog first for speed, then use live external catalog/web research when there is no high-confidence match. Return multiple plausible candidates when the number is ambiguous rather than falsely declaring an exact match.
3. **Identify the component**: show canonical part number, manufacturer/brand, common description, system/category, component location/position when sourced, and superseded/replacement numbers when evidence exists. Clearly label unknown fields.
4. **Confirm application**: distinguish part identity from fitment. Use year/make/model/trim/engine/transmission/drive/axle/brake/production-date/VIN details only as applicable to the component. Use catalog or OEM evidence, and show the exact restrictions and source. A generic search result is not proof of fitment.
5. **Find purchasing options**: search OEM dealers, Canadian distributors, reputable aftermarket suppliers, and used/recycled sources where useful. Deduplicate identical listings; keep condition and brand distinctions.
6. **Normalize and rank offers**: store seller, listing title, part number, condition, price, currency, tax/shipping/core charges if known, availability, shipping destination, return policy when available, source URL, retrieval timestamp and fitment evidence. Sort cheapest first within comparable currency/condition/fitment groups. Do not compare CAD and USD as if equal; optionally show converted estimates only with a disclosed live rate and timestamp. Do not claim "best price" based only on an incomplete sample.
7. **Explain confidence**: separate verified facts, seller claims, likely identification and unresolved details. Give a short reason for confidence and what is missing.
8. **Graceful failure**: if no match is found, say which searches were attempted, show safe direct searches for the exact original number and normalized number, allow retry with vehicle details, and never silently return an empty panel.
9. **Learn from corrections safely**: when a technician corrects a description or fitment, capture feedback for review and regression testing. Do not automatically convert an unverified user correction into universal truth.
10. **Privacy and reliability**: make external calls server-side; keep secrets off the client; authenticate and rate-limit; bound response sizes/timeouts; validate URLs and structured outputs; expose actionable errors; never fabricate a source, price or stock status.

## UI acceptance criteria

- One input can accept a part number or plain-language component description.
- Vehicle/equipment context is optional for initial identification but prompted for fitment verification when materially needed.
- Results show identification first, then a sortable supplier comparison.
- Default sort is lowest listed price within comparable groups; a visible reason explains why currencies or conditions are separated.
- Each offer links directly to the supplier listing and shows when the result was checked.
- Price, availability, shipping, taxes, core charge and fitment are individually labelled as verified, seller-stated, unknown or not included.
- The UI has explicit loading, no-match, ambiguous-match, partial-results, timeout, provider-unavailable and sign-in-required states.
- Search fallback links remain available if the research provider fails.

## Universal regression matrix

Run these against the deployed Parts Finder and inspect the source pages, not just the generated text.

| Query type | Example | Expected |
|---|---|---|
| OEM number | Nissan 47910-5AA0A | Identify from credible catalog evidence; retrieve source-linked listings |
| Formatting variants | 47910 5AA0A / 479105AA0A | Same canonical candidate, original query preserved |
| Aftermarket number | Brand plus aftermarket SKU | Identify the brand/SKU; don't mistake it for OEM |
| Cross-reference | Superseded/interchange number | Show relationship only when supported by a catalog |
| Plain description | “front right wheel speed sensor” | Ask for vehicle context for fitment, still provide useful candidate research |
| Ambiguous number | Common short numeric SKU | Show candidates and explain ambiguity; do not pick arbitrarily |
| Heavy equipment | Hydraulic filter / seal kit / track component number | Include equipment make/model/serial range in fitment evidence |
| Dimensions | Bearing or seal size | Match dimensions and unit system, but don't assert application without evidence |
| Electrical part | Connector, relay, sensor | Distinguish connector/pinout/application variants |
| Consumable | Oil/filter/belt | Check exact specification, size, rating and application, not just description similarity |
| No catalog result | Unknown valid-looking number | Trigger external fallback and show useful next steps |
| Provider failure | Timeout / 429 / invalid response | Clear retryable error; no fabricated result |
| Mixed currency | CAD $95 and USD $60 | Separate currency groups unless conversion is current and disclosed |
| Duplicate listings | Same seller/URL/price with tracking params | Suppress true duplicates; preserve distinct condition/fitment offers |
| Stale price | Search snippet differs from listing page | Mark price as unverified or omit it; never claim live stock |
| Wrong fitment | Similar-looking number for another axle/trim | Warn and exclude from confirmed-match ranking |
| User correction | Technician says listing is rear not front | Update this case and create a reviewed regression; don't globally trust unverified feedback |

## Definition of done

- Tests pass for all relevant cases, including timeout and malformed provider responses.
- The exact OEM number and multiple unrelated part categories are tested on a live preview.
- Every displayed price can be traced to a direct source and the currency is correct.
- The cheapest-first order is verified for each comparable group.
- Fitment warnings remain visible before the user clicks through to order.
- Existing VIN, diagnostic, AI research, authentication and subscription workflows still pass regression tests.
- A successful build and preview deployment are confirmed before merge. Production deployment is confirmed separately.
