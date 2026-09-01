# MKitchens repository guidance

## Start here

- Read `README.md` before changing the project. It is the handoff, construction-rule record, and open-question list.
- Treat `new cut list master 2.xlsx` as provenance, not an infallible specification. The accepted corrections to it are documented in `public/tests/diff-allowlist.js`.
- Keep dimensional and quantity logic in `public/js/constants.js` and `public/js/rules.js`. `public/js/app.js` may present inputs and outputs, but must not calculate panel geometry.
- Do not silently decide one of the trade questions in the README. Preserve the current rule or surface the decision explicitly for confirmation.

## Required verification

- Run `npm test` after any code change.
- Also run `node public/tests/run.js --diffs` after changing a construction constant, cabinet rule, catalogue option, job dimension, warning, aggregation rule, or exported numeric value. Inspect the accepted-difference report; passing alone is not enough if the intended result changed.
- Treat changes to panel dimensions, quantities, edge banding, front geometry, kickplate stock arithmetic, warnings, job-dimension propagation, consolidation, area/edging totals, and CSV numeric fields as calculation-bearing changes.
- Every new or changed construction rule needs a test with independently derived expected numbers. Prefer an invariant or a small explicit cabinet example; update the golden-master allowlist only when the spreadsheet difference is understood and documented.
- Before finishing a calculation-bearing change, delegate a separate read-only pass to the project agent `calculation_reviewer`. Give it the intended rule and the relevant diff, wait for its findings, and either resolve each finding or record why it is a trade decision. If custom agents are unavailable, perform the same checklist as a distinct review pass.

## Code Review Rules

- Prioritize anything that could order the wrong size, count, material, or edge treatment over style and refactoring comments.
- Manually derive at least one representative cabinet from the named constants and compare every output panel, not only the changed line.
- Check both orientations around `canon()`: when dimensions swap, the banded edge must follow the physical edge it describes.
- Check cabinet quantity multiplication, consolidation keys, total board area, total edging, and CSV values together; an internally correct panel can still be exported incorrectly.
- Check boundary inputs and overrides, including zero, blank/default, minimum buildable widths, non-standard widths, custom heights/depths, and parts near the sheet limit.
- Kickplates are a separate linear-stock calculation and must never become carcass-board panels or CSV rows. Automatic frontage is `width × quantity` for straight floor doors, drawers, bins and oven housings only. Add `end cupboard count × entered end depth`; use 2700 mm wood or 3000 mm aluminium stock and report `ceil(total / stock length)` as a minimum, not a cut-packing guarantee. A floor corner makes the stock result incomplete until the operator enters a combined measured allowance; explicit `0` means adjoining runs cover it. That measurement must become stale after any floor-cupboard line changes, because measured geometry or an adjoining-run coverage decision may no longer hold. Do not guess corner geometry, include tall cupboards, subtract the toe recess, add waste, or add wood to a supplier schedule until those open README questions are answered.
- Browser-local presets and named-job portability are Phase 5 state-management work, not calculation rules.
- Doors and drawer fronts are not part of the current cut list. The Gola checkbox records future front intent but does not change the current carcass CSV; do not treat the dormant `fronts()` helper as production-complete.
- Report confirmed defects separately from workshop questions and known accepted spreadsheet differences. Include a concrete cabinet input plus expected and actual output for every calculation finding.
