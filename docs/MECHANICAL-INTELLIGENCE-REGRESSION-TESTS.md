# TORQWISE Mechanical Intelligence Regression Tests

These are repeatable acceptance tests for the research assistant. They evaluate reasoning quality, evidence discipline, and whether follow-up answers use technician findings. A fluent answer alone does not pass. Run these against the deployed endpoint after the reasoning changes are reviewed and deployed.

## General pass criteria

- Answers the actual question first, at a useful technical level.
- Separates supplied facts, measured observations, sourced facts, hypotheses, and unknowns.
- Does not invent OEM specifications, part numbers, citations, live prices, or fitment.
- Ranks likely causes by evidence and recommends the most informative safe next check.
- Explains what normal and abnormal results would mean.
- Uses supplied follow-up results to update the prior differential instead of restarting a generic checklist.
- Uses relevant authoritative sources when live research is available; if it is not available, says so plainly.
- Does not claim a part is confirmed to fit from a part number alone.

## Test cases

### 1. Part-number identification and price comparison
**Input:** `47910-5AA0A`  
**Expected:** Identify the part only when a credible catalogue/source supports the identification. For purchase comparison, search the exact number and punctuation variants; return source-linked offers with visible prices, seller, currency, condition and fitment evidence. Sort lowest price first within each currency. Keep CAD and USD separate unless a clearly disclosed conversion method and current exchange rate are available. If no reliable listing is found, report no verified prices and offer useful next steps rather than guessing.

### 2. Multiple DTCs with a possible shared cause
**Input:** A vehicle reports P0171 and P0300. Ask for a diagnosis.  
**Expected:** Explain that neither code alone proves a component has failed. Consider a shared lean/misfire cause (such as unmetered air or fuel-delivery/measurement issues) while keeping alternatives open. Ask for or use freeze-frame, fuel trims, misfire counters and operating conditions. Recommend a discriminating test rather than replacing an oxygen sensor, MAF or coils without evidence. Do not fabricate numeric limits.

### 3. Test result changes the diagnosis
**First turn:** “Cranks but will not start; scan tool shows RPM while cranking.”  
**Follow-up:** “Fuel pressure is below the specification in the service manual.”  
**Expected:** Interpret the supplied fuel-pressure result first and move fuel supply/pressure control higher in the differential. Distinguish pump power/ground, pump output, filter/restriction, regulator/control and measurement/setup possibilities as appropriate to the system. Ask for the exact vehicle/system and spec only if needed. Do not keep recommending crank-sensor checks as the default after the new evidence.

### 4. Specification request
**Input:** “What is the torque spec for this axle nut?” with no vehicle details.  
**Expected:** Do not invent a number. Explain that the value depends on the exact application and may include a one-time-use fastener or tightening-angle procedure. Ask for year/make/model/engine and the specific axle/fastener, while giving the user a precise path to authoritative service data.

### 5. Heavy-equipment hydraulic fault
**Input:** “Excavator boom drifts down with the controls neutral.”  
**Expected:** Distinguish cylinder leakage, control-valve leakage, load-holding valve issues, thermal expansion and linkage/load effects without declaring a failed cylinder. Emphasize safe load support and the machine-specific lockout/pressure-release procedure; never recommend checking high-pressure leaks by hand. Recommend the next safe isolation test only with the model-specific service procedure.

### 6. Contradictory evidence
**First turn:** “Suspect alternator failure; battery light is on.”  
**Follow-up:** “Charging voltage and alternator ripple both pass the OEM test.”  
**Expected:** Explicitly lower the probability of alternator failure, retain the measured result as evidence, and investigate the warning-lamp circuit, command/control, wiring, belt/pulley or intermittent conditions as appropriate. Do not defend the earlier guess.

### 7. Recall/TSB lookup
**Input:** “Is there a TSB for this symptom?” without vehicle details.  
**Expected:** Ask for exact application details that materially affect the search. If live search is available, prioritize manufacturer/OEM and official recall sources. Do not invent bulletin numbers or state that no bulletin exists unless the search scope supports that conclusion.

## Release gate

Before calling the assistant work-ready, run all applicable cases against the deployed website on mobile and desktop, inspect source links and response times, confirm authentication/usage accounting, and record any failures as regression issues. Part-price results must be checked against the seller pages manually; a search snippet is not proof of current stock or final delivered cost.
