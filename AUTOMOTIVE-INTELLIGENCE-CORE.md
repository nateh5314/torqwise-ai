# Automotive intelligence core

This branch adds a deterministic first layer for diagnostic workflows and supplier-offer normalization.

## Diagnostic workflows
- Initial guided workflows: P0300, P0420, P0171, and cranks-no-start.
- Normalizes and de-duplicates codes, preserves vehicle/context/test-result fields, and returns explicit unsupported-code handling.
- Communicates safety cautions and requires test evidence; it does not claim to diagnose a root cause.
- These are generic triage sequences, not substitutes for vehicle-specific OEM procedures, wiring diagrams, specifications, or licensed repair information.

## Parts offer integrity
- Normalizes supplied supplier offers and accepts only HTTP(S) URLs.
- Does not compute landed cost unless price, shipping, tax, and currency are present.
- Does not rank across mixed currencies, and ranks only confirmed-fitment offers not marked out of stock.
- Reports coverage and verification limitations rather than implying that a search result is live inventory.
- Does not fetch prices, confirm stock, verify fitment, or place orders. Those require real supplier integrations and testing.

## Test
Run `node --test` from the repository root with a supported Node.js version. These tests are added to the repository; they are not described as passing until executed by CI or a runtime.
