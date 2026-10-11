# Bundled diagnostic database

TORQWISE's diagnostic search loads `assets/dtc-database.json` from the same deployed site origin. Browsers do not call the third-party dataset host at runtime.

## Build

Netlify runs `npm run build`. The build script downloads the open OBDex generic OBD-II dataset, validates the payload and code uniqueness, and writes the resulting data asset into `assets/dtc-database.json`. The build fails rather than silently publishing a missing or undersized database. The original curated diagnostic guides remain in `index.html`.

## Data scope and source

- Source project: https://github.com/foerbsnavi/OBDex
- Source data: https://github.com/foerbsnavi/OBDex/tree/main/data/generic
- Dataset license: CC0-1.0 (as stated by the source project's LICENSE-DATA)
- Scope: generic P-, B-, C- and U-family OBD-II definitions. This does not include a complete manufacturer-specific DTC catalogue, factory service procedures, wiring diagrams, live scan-tool data, or guaranteed vehicle-specific repair steps.
- Each source update is checked for at least 9,000 unique records, valid code format, and required English titles/source references before it can be published.

The source is fetched at build time only; the deployed website serves its generated JSON asset locally. A later build refreshes the snapshot from the source. If all sources fail or the dataset fails validation, the build stops. Review the source licence and contents before changing data providers.

## Diagnostic safety

Definitions, causes and repair estimates are reference material, not proof that a component has failed. Verify the vehicle, code status, freeze-frame data, service procedures, parts fitment, and safety-critical instructions before repairs. Manufacturer-specific definitions should only be added from a verified source with clear reuse rights.
