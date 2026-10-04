# MKitchens Cutlist Manager

A cutting list generator for kitchen carcasses in 16 mm melamine board.

Replaces the manual process of working through `new cut list master 2.xlsx` after
every kitchen design. You pick cabinets, it produces the panel list and a clean
CSV for the board supplier.

**Status: Phase 5 complete.** A whole kitchen can be entered, adjusted and
exported as a CSV for the board supplier. Named jobs and portable JSON backups
of jobs and preset libraries are available.

---

## Why this exists

The original workbook works, and the construction logic inside it is sound. But
it is 391 hand-maintained rows, and over time some of the bookkeeping drifted:
blocks copied from their neighbours kept a reference pointing at the wrong cell,
a few quantities were typed as zero, and one back panel is cut from the wrong
dimension entirely.

The full analysis, including the 21 verified faults and the reasoning behind
every decision here, is in the project blueprint:

**https://claude.ai/code/artifact/57142068-bd1b-4b08-80d4-6fff6ec82d26**

Fault numbers referenced in the code comments refer to the register in that
document.

---

## Running it

Everything is plain JavaScript. There is no build step and nothing to install
for the app itself.

### The app

Open `public/index.html` through any web server - it needs one because the code
is split into modules:

```
cd public && python -m http.server 8000
```

then visit `http://localhost:8000`.

### The tests

```
npm test                            # engine, catalogue and interface
node public/tests/run.js --diffs    # also list every value that differs from the spreadsheet
npm run smoke                       # just the interface load test
```

The same checks run in a browser at `/tests.html`, with no Node needed. That
page is live on the deployed site, so the calculations can be verified at any
time from any machine.

### Regenerating the fixtures

Only needed if the original workbook changes. Requires Python and `openpyxl`.

```
python tools/extract_fixtures.py
```

---

## Using it

The left side is the kitchen, the right side is what to cut.

Along the top are three things worth knowing about before anything else:
**Text size** (three steps, for tired eyes), **Theme** (light, dark, or follow
the computer), and **Download cutting list**, which is the button that produces
the file for the supplier. All three remember what you chose.

1. Fill in the client and reference. **Gola** is recorded for the future front
   list, but fronts are not included in this version, so it does not change the
   current carcass CSV.
2. Under **Add a cabinet**, pick a type and shape, click a standard width or
   type any width at all, set a quantity, and press Add. Enter adds it too, so
   a whole run can be typed without touching the mouse.
3. Each cabinet gets a card. **Options** opens its settings - shelves, doors,
   drawer count, runner depth, return leg, oven aperture. Anything left blank
   uses the standard for that family.
4. Set a cabinet up the way you like it and press **Save as preset** on its
   card. It appears under *Your presets* and can be added again in one click on
   any future kitchen. Presets are stored on that computer.
5. The cutting list updates as you go, in one of two views:

   - **By cabinet** - a section per cupboard with its size and settings in the
     heading, and the panels for *one unit* beneath it. This is the sheet the
     workshop builds from when the board comes back. It is the default.
   - **Consolidated** - identical panels merged across the whole kitchen with a
     total quantity. This is what goes to the supplier.

   The cabinet card also states what it will cut - "Doors · 1 door · 3 shelves" -
   so a change to an option confirms itself without hunting for it in the list.
   Cabinet edits recalculate as you type. Save job keeps a named snapshot;
   it is not needed to apply cabinet changes.
6. Press **Download cutting list** for the supplier's CSV.

The **Kickplate calculator** underneath the kitchen list is separate from the
carcass cutting list. It automatically totals the straight floor-cupboard
fronts, then asks for exposed end returns and any corner measurement before it
reports the stock lengths to buy.

Anything that cannot be built is flagged rather than silently cut - a corner
unit too narrow for its return, an oven housing too short for the appliance, a
panel bigger than a sheet.

**Job dimensions** holds the heights and depths every cabinet is derived from.
Changing one re-cuts the whole kitchen.

The kitchen you are working on, including its kickplate-calculator settings, is
kept in the browser so a refresh does not lose it.

Use **Save job** to keep a named snapshot on this browser. **Open** restores a
selected snapshot; **Rename**, **Duplicate** and **Delete** manage saved jobs.
Duplicate copies the selected saved snapshot, not unsaved draft edits. **New job**
starts with standard dimensions and leaves saved jobs and presets available.
Edits autosave to the working draft; update a named snapshot with Save job.
After a refresh the draft and its named-job association remain available.

**Export job backup** downloads the current draft as a versioned JSON file.
**Import job backup** validates the whole file, then asks before replacing the
draft; it never overwrites a named job. Save the imported draft to name it.
Presets have separate export/import buttons. Import adds presets to the library,
including same-named entries, and leaves existing presets in place. Browser jobs
and presets are local to that browser/site; keep JSON backups to move computers
or protect against cleared site data. Theme and text size stay on the computer.
Invalid files, unsupported versions and files over 5 MB are rejected.
Storage failures are reported for named-job saves and preset imports.

---

## How the engine works

Everything derives from a handful of job dimensions plus one cabinet width.

| Symbol | Meaning | Default |
|---|---|---|
| FH / FD | Floor unit height and depth | 720 / 560 |
| Kick | Plinth height under the floor units | 150 |
| WH₁ / WH₂ | Wall unit height, tall and standard | 1080 / 720 |
| WD | Wall unit depth | 300 |
| TH / TD | Tall unit height and depth | 2296 / 580 |
| BH / BD | Built-in cupboard height and depth | 2500 / 560 |
| T | Board thickness | 16 |

A cabinet is a small object. The engine turns it into panels:

```js
import { expandCabinet } from './public/js/rules.js';

const { parts, warnings } = expandCabinet({
  type: 'floor',
  config: 'drawers',
  width: 630,                       // any width, not just the standard ones
  qty: 2,
  label: 'Sink run, left of window',
  overrides: { drawers: 3, runnerDepth: 500 },
});
```

Every override is optional. Leave one out and the family default applies.

### Cabinet types and configurations

| type | config | notes |
|---|---|---|
| `floor` | `doors` | 1 or 2 doors, one shelf |
| `floor` | `drawers` | 2, 3 or 4 drawer stack |
| `floor` | `bin` | single bin drawer |
| `floor` | `oven` | under-counter oven housing |
| `floor` | `corner` | L-shaped, `legWidth` sets the return |
| `wallTall` / `wallStd` | `doors` | 1080 or 720 high |
| `wallTall` / `wallStd` | `flap` | shallow appliance box |
| `wallTall` | `corner` | |
| `tall` | `grocery` | 2 fixed shelves, 3 loose |
| `tall` | `broom` | 1 fixed shelf, 1 loose |
| `tall` | `elo` | eye level oven housing |
| `tall` | `corner` | |
| `bic` | `run` | built-in cupboard bay |

### Overrides

`height`, `depth`, `shelves`, `fixedShelves`, `doors`, `drawers`,
`runnerDepth`, `cleats`, `back`, `legWidth`, and for eye level ovens
`aperture` and `apertureBottom`.

### Floor units and kickplates

The fresh-job starting point is a **720 mm carcass with a 150 mm kickplate**.
The familiar alternative is 780 with 100. Carcass height and kickplate height
remain separate job fields: changing one never silently changes the other, so
non-standard combinations are still possible.

| Carcass | Plinth | Finished height |
|---|---|---|
| 720 | 150 | 870 |
| 780 | 100 | 880 |

Kickplates are linear stock, not one carcass-board panel per cabinet. The
calculator adds `width × quantity` for straight floor doors, drawers, bin units
and under-counter ovens. Wall, tall, built-in cupboard and floor-corner widths
are not added automatically. Exposed ends add `number of end cupboards × end
depth`; leaving end depth blank follows the job's floor depth.

A floor corner makes the result incomplete until its **combined measured
allowance** is entered. Enter an explicit `0` only when adjoining runs cover the
corner. This avoids guessing whether an L-shaped corner needs one strip, two
strips or no separate strip. Changing any floor-cupboard line invalidates that
measurement and asks for it again, because an explicit zero can depend on the
adjoining runs remaining unchanged.

Wood stock is 2700 mm long and aluminium stock is 3000 mm long. The calculator
shows total measured length, the minimum number of full stock lengths, and the
spare before cuts. That stock count assumes offcuts can be reused; it is not a
cut-packing plan and does not add kerf, trimming or waste. Both materials stay
out of the carcass-board CSV.

An older browser draft can continue to show its saved 100 mm height. A genuinely
fresh job, or **Reset to standard**, uses 720 and 150; saved jobs are never
silently rewritten.

### Eye level ovens

Structurally a grocery carcass with an appliance aperture between its two fixed
shelves. The aperture consumes no board, so it does not appear in the cut list -
but the engine checks the appliance will actually fit and warns if it will not.

```js
expandCabinet({
  type: 'tall', config: 'elo', width: 600,
  overrides: { aperture: 'single', apertureBottom: 800 },
});
```

`aperture` is `single` (600 mm), `double` (890 mm) or `compact` (450 mm, for a
microwave or combi oven - what the old sheet called "elo micro"), or a number
for a non-standard appliance.

Built-in ovens are about 595 mm wide and are made to drop into a **600 mm**
cabinet. The engine warns below that. The original input sheet listed elo at
600 and 750 - the 750 is worth querying.

---

## The export

**Download cutting list** produces a CSV named for the job, for example
`MKitchens_CutList_Adnaan_KIT-0417_2026-08-28.csv`.

```
Name,Length,Width,Quantity,Material,Thickness,L1,L2,W1,W2,Edging,Cabinet,Part
F600 2-door sides,720,560,4,White Melamine,16,Y,,,,White 22mm,F600 2-door,sides
F600 2-door base,568,560,2,White Melamine,16,Y,,,,White 22mm,F600 2-door,base
F600 2-door back,703,568,2,White Melamine,16,,,,,,F600 2-door,back
```

Identical panels are merged across the whole kitchen with a summed quantity,
which is what the supplier wants.

Kickplate stock is deliberately excluded. Aluminium is not melamine, and a
total linear requirement is not a valid MaxCut panel. Use the calculator's
separate purchase result instead.

`L1`, `L2`, `W1`, `W2` are the trade's names for the four edges of a panel -
the two long edges, then the two short ones. A shelf is banded `L1`; a cabinet
side is banded `L1` and `W1`; a drawer base has none.

`Name`, `Length`, `Width`, `Quantity` and `Material` are the five fields MaxCut
needs to import a job, so the same file opens as a plain table in Excel and
imports into MaxCut without being edited first.

There is deliberately **no grain column**. Grain runs the long way - up the
height of a door or panel - and the supplier reads that off the dimensions,
which is why every part leaves the engine with its longer side first.

### What this deliberately does not do

It does not nest parts onto sheets. MaxCut, and the supplier, already do that
better than we could. This produces the accurate parts list that feeds them,
which is the step the spreadsheet was doing by hand.

---

## Panel orientation, and why it matters

Each panel is built with two named dimensions and records **which of its edges
are banded**, rather than storing "long edge" and "short edge" counts the way
the spreadsheet does.

That distinction is the reason several of the original faults cannot happen
here. In a cabinet narrower than it is deep, length and width swap places - and
in the spreadsheet the banding sometimes did not swap with them, so the edging
ended up on the side of a shelf instead of its front. Here the sorting happens
once, at the very end, in `canon()`, and the banding always follows its own
dimension.

Everything leaving the engine is in canonical orientation: `l` is the longer
side, `eL` is the number of banded edges running along it.

---

## Testing

### Independent calculation review

The repository includes a project-scoped, read-only Codex agent at
`.codex/agents/calculation-reviewer.toml`. It is deliberately separate from the
implementing agent and concentrates on panel dimensions, quantities, edge
banding, kickplate stock arithmetic, warnings, consolidation, area and edging
totals, and the numeric values that reach the CSV. `AGENTS.md` requires that
independent pass before any calculation-bearing change is considered finished.

Ask Codex to **use `calculation_reviewer` to audit the current calculation
changes**, with the intended construction rule in the prompt. For a general
review of an uncommitted diff, `/review` remains useful as a second, broader
code-review pass. The reviewer complements the deterministic suite below; it
does not replace it or the real-job comparison.

The automated suite has six parts, in `public/tests/` and `tools/`:

**Golden master** (`golden.js`) - all 56 cabinet blocks from the workbook,
rebuilt and compared panel by panel. 43 reproduce it exactly. The other 13
differ only by changes listed in `diff-allowlist.js`, each with a reason and a
fault number. Anything else is a failure.

**Invariants** (`invariants.js`) - properties that must hold for any cabinet:
internal width is always `W - 2T`, the back fits its opening, a drawer front
stack fills the cabinet height exactly, quantities survive consolidation.

**Catalogue** (`tests/catalog.js`) - walks every type, shape and standard width
the interface offers and checks the engine can build it. It also checks that
every option actually changes something: a control that looks live but does
nothing is worse than no control at all. This caught two real faults - a corner
unit offered at widths that produced a negative panel, and an oven housing
offered too narrow for any oven.

**Width sweep** (`sweep.js`) - every family and configuration built at every
width from 100 mm to 1200 mm. 18,717 cabinets and 96,888 carcass panels with the
current catalogue. The rule is not that every width is buildable - a 60 mm
cabinet is not - but that
the engine never produces a bad panel *silently*.

**Interface smoke test** (`tools/smoke-test.mjs`) - loads the app against a
small DOM shim, adds cabinets, exercises the kickplate calculator and checks a
cutting list comes out. It exists to catch a load-time error, which would
otherwise show as a blank page.

**Portability** (`tools/portable-test.mjs`) - checks versioned job and preset
backups, rejects invalid files, and verifies that restored jobs produce the
same panels, totals, CSV values and kickplate results.

**Practical validation confirmed (4 October 2026):** the project owner reports
that their former boss tested multiple cut-list outputs against the old
spreadsheet calculations and confirmed that the results look good. Specific
job inputs and supplier-order comparisons were not supplied. This records the
completed output comparison without resolving the construction questions below.

Phase 5 tests check saved-job reopening and JSON round trips, including custom
dimensions, overrides, quantities, corner measurements, consolidated parts,
board/edging totals and supplier CSV equivalence.

**Phase 5 user checks confirmed (4 October 2026):** saving and loading a named
job worked, refreshing preserved the working session, and the tested export
came out well. Export presentation/formatting is deferred to a later improvement.
The independent calculation review also passed, with no remaining findings or
new spreadsheet differences.

---

## The accepted changes

`node public/tests/run.js --diffs` prints all 20. In summary:

- Wall and tall back heights standardised to `H - 32`. High wall units used
  `H - 33`; every back gains 1 mm.
- Shelf setback standardised to 26 mm. The 900 high wall used 20 mm.
- Tall fixed shelf setback standardised to 18 mm. The 450 grocery used 17 mm.
- The 450 grocery back is cut to the internal width. It was being cut using the
  cabinet depth, giving a panel that does not fit.
- The 500 std wall shelf is restored - its quantity was typed as zero, so it was
  never cut.
- The 100 high wall top and bottom now match the depth its sides are cut to.
- The 150 floor cleat is 125 mm deep like every other.
- Edge banding corrected on the 300 high wall shelf and the 500 bic shelves.

The multiple-output spreadsheet comparison above is now confirmed. The accepted
differences remain documented individually in `diff-allowlist.js`.

---

## Project layout

Everything Render serves lives in `public/`. Everything else stays in the
repository but off the web - which matters, because the original workbook holds
a client name and per-square-metre pricing.

```
public/                    <- the published site
  index.html               the app
  css/app.css              interface styles
  js/
    constants.js           shared dimensions and construction constants
    rules.js               the engine - pure functions, no DOM, no state
    catalog.js             what the interface offers: types, shapes, widths
    csv.js                 the supplier export
    app.js                 interface wiring - holds no maths
    portable.js            versioned job/preset file validation
  tests.html               the checks, in a browser
  tests/
    fixtures.js            56 cabinet blocks lifted from the workbook (generated)
    blockmap.js            maps each block to its equivalent cabinet object
    diff-allowlist.js      accepted differences, each with a reason
    golden.js              golden-master comparison
    invariants.js          property checks
    catalog.js             checks every offered option against the engine
    sweep.js               width sweep
    run.js                 command-line runner

tools/
  extract_fixtures.py      regenerates fixtures.js from the workbook
  smoke-test.mjs           loads the interface headlessly to catch a blank page
  portable-test.mjs        checks backup validation and output round trips
new cut list master 2.xlsx  the original - kept for provenance, never served
```

### Where to change things

| To change | Edit |
|---|---|
| A dimension or construction rule | `public/js/constants.js` |
| How a cabinet is built | `public/js/rules.js` |
| What types, shapes or widths are offered | `public/js/catalog.js` |
| The export columns | `public/js/csv.js` |
| Wording, layout, behaviour | `public/js/app.js`, `public/css/app.css` |

`rules.js` never touches the page and `app.js` never calculates a panel size.
Keeping that line is what makes the whole thing testable.

---

## What comes next

| Phase | | |
|---|---|---|
| 1 | Engine and tests | **done** |
| 2 | Working interface - job settings, add cabinets, live parts table | **done** |
| 3 | Standard-width presets and the per-cabinet override panel | **done** |
| 4 | CSV export for the supplier | **done** |
| 5 | Named jobs; portable job and preset import/export | **done** |

Phase 5 is closed after automated checks, independent review and the user
checks recorded above. Export presentation/formatting is a follow-up improvement.

Held back for a later version: doors and drawer fronts, per-m² pricing, and
hardware counts. `fronts()` in `rules.js` holds partial exploratory geometry,
but corner, oven and built-in fronts still need completing and testing before
any front list is surfaced.

### Deploying

Render, as a **Static Site**.

| Setting | Value |
|---|---|
| Build Command | *blank* |
| Publish Directory | `public` |
| Branch | `main` |

Deploys automatically on push. The checks are live at `/tests.html`, so the
calculations can be verified from any browser without installing anything.

---

## Open questions

These need answering by someone who builds the kitchens. None of them block
the interface work.

1. Tall height is 2296 and hard-typed, but the sheet labels it as if it derives
   from the floor and wall units. What should it be calculated from?
2. The dormant front helper reduces floor doors by 35 mm for Gola and nothing
   else. Before fronts are surfaced, should drawer fronts, wall doors or tall
   doors also be reduced?
3. The under-counter oven base is cut full width rather than `W - 32`, and so
   are its cleats. Deliberate, or drift?
4. Normalising drawer reveals moves the 2-drawer and 3-drawer deep fronts by
   1 mm, in exchange for the stack tracking the floor height. Acceptable?
5. Default shelf counts - two per tall wall unit, one per std wall, three loose
   plus two fixed per grocery. Right as starting points?
6. What sheet size does the supplier work in? Currently assumed 2750 × 1830.
7. A 745 wall unit gives two 369.5 mm doors. Round to 369, or is 745 a typo
   for 750?
8. The 290 std wall has no shelf, but its 200 mm neighbour does. Omission?
9. Minimum widths are set at 600 for floor and tall corners, 450 for wall
   corners and 600 for oven housings. Are those the right cut-offs?
10. What measured allowance should an L-shaped floor corner contribute: one
    strip, both legs, or zero when adjoining runs cover it? The calculator asks
    for the combined corner measurement until there is a confirmed formula.
11. Do floor-standing tall cupboards share the plinth run and therefore need
    their widths included automatically? They are currently excluded.
12. Should an exposed end return use the full entered cupboard depth, or should
    the 50 mm toe recess be subtracted? The calculator currently uses the full
    depth exactly as entered.
13. Should wooden kickplate stock eventually have its own supplier schedule, or
    is the calculator's purchase quantity enough? It is not sent to MaxCut now.
14. Should all carcass dimensions be restricted to whole millimetres? Invalid
    cabinet and shelf quantities now fail closed, but custom height, depth and
    width can still be entered at half-millimetre precision.
