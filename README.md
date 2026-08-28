# MKitchens Cutlist Manager

A cutting list generator for kitchen carcasses in 16 mm melamine board.

Replaces the manual process of working through `new cut list master 2.xlsx` after
every kitchen design. You pick cabinets, it produces the panel list and a clean
CSV for the board supplier.

**Status: Phase 2 complete.** The engine is written and tested, and the
interface works - a whole kitchen can be entered and its cutting list read on
screen. CSV export and saved jobs are still to come.

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

1. Fill in the client and reference. Tick **Gola** if the kitchen uses a gola
   profile - floor doors then lose 35 mm.
2. Under **Add a cabinet**, pick a type and shape, click a standard width or
   type any width at all, set a quantity, and press Add. Enter adds it too, so
   a whole run can be typed without touching the mouse.
3. Each cabinet gets a card. **Options** opens its settings - shelves, doors,
   drawer count, runner depth, return leg, oven aperture. Anything left blank
   uses the standard for that family.
4. The cutting list updates as you go, in one of two views:

   - **By cabinet** - a section per cupboard with its size and settings in the
     heading, and the panels for *one unit* beneath it. This is the sheet the
     workshop builds from when the board comes back. It is the default.
   - **Consolidated** - identical panels merged across the whole kitchen with a
     total quantity. This is what goes to the supplier.

   The cabinet card also states what it will cut - "Doors · 1 door · 3 shelves" -
   so a change to an option confirms itself without hunting for it in the list.

Anything that cannot be built is flagged rather than silently cut - a corner
unit too narrow for its return, an oven housing too short for the appliance, a
panel bigger than a sheet.

**Job dimensions** holds the heights and depths every cabinet is derived from.
Changing one re-cuts the whole kitchen.

The kitchen you are working on is kept in the browser so a refresh does not lose
it. Named jobs, and moving a job between machines, come in phase 5.

---

## How the engine works

Everything derives from a handful of job dimensions plus one cabinet width.

| Symbol | Meaning | Default |
|---|---|---|
| FH / FD | Floor unit height and depth | 720 / 560 |
| WH₁ / WH₂ | Wall unit height, tall and standard | 1080 / 720 |
| WD | Wall unit depth | 300 |
| TH / TD | Tall unit height and depth | 2296 / 580 |
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

Three layers, in `tests/`:

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
width from 100 mm to 1200 mm. Around 18,700 cabinets and 96,000 panels. The
rule is not that every width is buildable - a 60 mm cabinet is not - but that
the engine never produces a bad panel *silently*.

**Interface smoke test** (`tools/smoke-test.mjs`) - loads the app against a
small DOM shim, adds cabinets and checks a cutting list comes out. It exists to
catch a load-time error, which would otherwise show as a blank page.

There is a fourth layer no test can cover: **run a kitchen that has already
been built through the engine and compare the result to what actually went to
the supplier.** That is what turns a passing suite into trust, and it is worth
doing before the first real job.

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

**These should be checked against a real job before the first order goes out.**

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
    constants.js           every dimension and construction constant, named
    rules.js               the engine - pure functions, no DOM, no state
    catalog.js             what the interface offers: types, shapes, widths
    app.js                 interface wiring - holds no maths
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
new cut list master 2.xlsx  the original - kept for provenance, never served
```

### Where to change things

| To change | Edit |
|---|---|
| A dimension or construction rule | `js/constants.js` |
| How a cabinet is built | `js/rules.js` |
| What types, shapes or widths are offered | `js/catalog.js` |
| Wording, layout, behaviour | `js/app.js`, `css/app.css` |

`rules.js` never touches the page and `app.js` never calculates a panel size.
Keeping that line is what makes the whole thing testable.

---

## What comes next

| Phase | | |
|---|---|---|
| 1 | Engine and tests | **done** |
| 2 | Working interface - job settings, add cabinets, live parts table | **done** |
| 3 | Standard-width presets and the per-cabinet override panel | **done** |
| 4 | CSV export, print view, edging totals | next |
| 5 | Named jobs, import and export | |

Held back for a later version: doors and drawer fronts, per-m² pricing, and
hardware counts. The front geometry is already decoded and implemented in
`fronts()` in `rules.js`, it is simply not surfaced yet.

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
2. Gola currently reduces floor doors by 35 mm and nothing else. Should drawer
   fronts, wall doors or tall doors also be reduced?
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
