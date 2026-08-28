/**
 * Invariant tests: properties that must hold for every cabinet the engine can
 * produce, whatever the width.
 *
 * The golden master proves the engine reproduces the spreadsheet. These prove
 * it does not produce nonsense for the widths the spreadsheet never covered -
 * which is the whole point of making it parametric.
 */

import { expandCabinet, fronts, resolve, consolidate, totalArea, totalEdging } from '../js/rules.js';
import { DEFAULT_GLOBALS, K, SHEET } from '../js/constants.js';

const checks = [];
const test = (name, fn) => checks.push({ name, fn });

/** Assertion helper - throws with a useful message. */
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/* ------------------------------------------------------------------ *
 * Panel sanity
 * ------------------------------------------------------------------ */

test('every panel has a positive, finite, whole-millimetre size', () => {
  const cases = [
    { type: 'floor', config: 'doors', width: 600, overrides: { doors: 2 } },
    { type: 'floor', config: 'drawers', width: 600, overrides: { drawers: 4 } },
    { type: 'floor', config: 'drawers', width: 900, overrides: { drawers: 3 } },
    { type: 'wallTall', config: 'doors', width: 900, overrides: { shelves: 2 } },
    { type: 'wallStd', config: 'doors', width: 600, overrides: { shelves: 1 } },
    { type: 'tall', config: 'grocery', width: 600, overrides: {} },
    { type: 'tall', config: 'broom', width: 450, overrides: {} },
    { type: 'tall', config: 'elo', width: 600, overrides: {} },
    { type: 'bic', config: 'run', width: 900, overrides: {} },
  ];

  for (const cab of cases) {
    const { parts } = expandCabinet({ ...cab, qty: 1 });
    assert(parts.length > 0, `${cab.type}/${cab.config} produced no parts`);
    for (const p of parts) {
      assert(Number.isFinite(p.l) && Number.isFinite(p.w),
        `${cab.type}/${cab.config} ${p.desc}: non-finite size ${p.l}x${p.w}`);
      assert(p.l > 0 && p.w > 0,
        `${cab.type}/${cab.config} ${p.desc}: non-positive size ${p.l}x${p.w}`);
      assert(Number.isInteger(p.l) && Number.isInteger(p.w),
        `${cab.type}/${cab.config} ${p.desc}: fractional size ${p.l}x${p.w}`);
      assert(p.qty > 0, `${cab.type}/${cab.config} ${p.desc}: quantity ${p.qty}`);
      assert(p.l >= p.w, `${cab.type}/${cab.config} ${p.desc}: not in canonical orientation`);
    }
  }
});

test('canonical orientation puts each edge count with its own dimension', () => {
  // A shelf in a cabinet deeper than it is wide must still band the front.
  const narrow = expandCabinet(
    { type: 'floor', config: 'doors', width: 300, overrides: { doors: 1 }, qty: 1 },
  ).parts;
  const shelf = narrow.find((p) => p.desc === 'shelf');
  const inner = 300 - 32;

  assert(shelf.w === inner || shelf.l === inner,
    `shelf ${shelf.l}x${shelf.w} does not carry the internal width ${inner}`);
  const bandedLength = shelf.l === inner ? shelf.eL : shelf.eS;
  assert(bandedLength === 1,
    `narrow shelf bands the wrong edge: ${shelf.l}x${shelf.w} e${shelf.eL}/${shelf.eS}`);
});

/* ------------------------------------------------------------------ *
 * Carcass geometry
 * ------------------------------------------------------------------ */

test('internal width is always W minus two board thicknesses', () => {
  for (const width of [150, 300, 450, 541, 600, 630, 900, 1200]) {
    const cab = { type: 'floor', config: 'doors', width, overrides: { doors: 1 }, qty: 1 };
    const { parts } = expandCabinet(cab);
    const { T } = resolve(cab);
    const base = parts.find((p) => p.desc === 'base');
    const inner = width - 2 * T;
    assert(base.l === inner || base.w === inner,
      `${width} mm base is ${base.l}x${base.w}, expected one side to be ${inner}`);
  }
});

test('the back fits the opening it belongs to', () => {
  // Floor: back sits above the base, so it is one board thickness shorter
  // than the carcass minus a millimetre of clearance.
  const floor = expandCabinet(
    { type: 'floor', config: 'doors', width: 600, overrides: { doors: 2 }, qty: 1 },
  ).parts;
  const floorBack = floor.find((p) => p.desc === 'back');
  assert(floorBack.l === DEFAULT_GLOBALS.floorHeight - K.floorBackReduction,
    `floor back height ${floorBack.l}`);
  assert(floorBack.w === 600 - 32, `floor back width ${floorBack.w}`);

  // Wall and tall: back sits between top and bottom.
  for (const [type, height] of [
    ['wallTall', DEFAULT_GLOBALS.wallTallHeight],
    ['wallStd', DEFAULT_GLOBALS.wallStdHeight],
  ]) {
    const parts = expandCabinet(
      { type, config: 'doors', width: 600, overrides: { shelves: 1 }, qty: 1 },
    ).parts;
    const back = parts.find((p) => p.desc === 'back');
    assert(back.l === height - 32, `${type} back height ${back.l}, expected ${height - 32}`);
  }
});

test('drawer boxes clear the runners', () => {
  for (const width of [450, 600, 900]) {
    for (const drawers of [2, 3, 4]) {
      const { parts } = expandCabinet({
        type: 'floor', config: 'drawers', width,
        overrides: { drawers, runnerDepth: 500 }, qty: 1,
      });
      const box = parts.find((p) => p.desc === 'draw inner fr back');
      const expected = width - 32 - K.drawerRunnerAllowance;
      assert(box.l === expected || box.w === expected,
        `${width}/${drawers}-drawer box is ${box.l}x${box.w}, expected ${expected}`);
    }
  }
});

test('drawer box counts are two front-and-backs, two sides and one base each', () => {
  for (const drawers of [2, 3, 4]) {
    const { parts } = expandCabinet({
      type: 'floor', config: 'drawers', width: 600,
      overrides: { drawers, runnerDepth: 500 }, qty: 1,
    });
    const sum = (desc) => parts.filter((p) => p.desc === desc)
      .reduce((n, p) => n + p.qty, 0);

    assert(sum('draw inner fr back') === drawers * 2,
      `${drawers}-drawer: ${sum('draw inner fr back')} front/back panels`);
    assert(sum('draw sides') === drawers * 2,
      `${drawers}-drawer: ${sum('draw sides')} sides`);
    assert(sum('draw base') === drawers,
      `${drawers}-drawer: ${sum('draw base')} bases`);
  }
});

/* ------------------------------------------------------------------ *
 * Fronts
 * ------------------------------------------------------------------ */

test('a drawer front stack fills the cabinet height exactly', () => {
  for (const drawers of [2, 3, 4]) {
    for (const height of [720, 750, 800]) {
      const cab = {
        type: 'floor', config: 'drawers', width: 600,
        overrides: { drawers }, qty: 1,
      };
      const stack = fronts(cab, { ...DEFAULT_GLOBALS, floorHeight: height });
      const count = stack.reduce((n, f) => n + f.qtyPer, 0);
      const used = stack.reduce((sum, f) => sum + f.height * f.qtyPer, 0);
      const gaps = (count - 1) * K.frontReveal;

      assert(count === drawers, `${drawers}-drawer produced ${count} fronts`);
      assert(used + gaps === height - K.frontReveal,
        `${drawers} fronts at height ${height}: ${used} + ${gaps} gaps ` +
        `!= ${height - K.frontReveal}`);
    }
  }
});

test('gola reduces floor doors and nothing else', () => {
  const withGola = { ...DEFAULT_GLOBALS, gola: true };
  const plain = { ...DEFAULT_GLOBALS, gola: false };

  const floorDoor = (g) => fronts(
    { type: 'floor', config: 'doors', width: 600, overrides: { doors: 2 } }, g,
  )[0].height;
  const wallDoor = (g) => fronts(
    { type: 'wallStd', config: 'doors', width: 600, overrides: { doors: 1 } }, g,
  )[0].height;

  assert(floorDoor(plain) - floorDoor(withGola) === K.golaReduction,
    'gola did not reduce the floor door');
  assert(wallDoor(plain) === wallDoor(withGola),
    'gola should not affect wall doors under the current rule');
});

/* ------------------------------------------------------------------ *
 * Eye level ovens
 * ------------------------------------------------------------------ */

test('an eye level oven housing warns when the appliance will not fit', () => {
  const tooShort = expandCabinet({
    type: 'tall', config: 'elo', width: 600,
    overrides: { height: 1200, aperture: 'double', apertureBottom: 800 }, qty: 1,
  });
  assert(tooShort.warnings.some((w) => w.includes('aperture does not fit')),
    'no warning for an oven that cannot fit');

  const fits = expandCabinet({
    type: 'tall', config: 'elo', width: 600,
    overrides: { aperture: 'single', apertureBottom: 800 }, qty: 1,
  });
  assert(fits.warnings.length === 0,
    `standard elo warned unexpectedly: ${fits.warnings.join('; ')}`);
});

test('an eye level oven warns when the cabinet is too narrow for the appliance', () => {
  const narrow = expandCabinet({
    type: 'tall', config: 'elo', width: 500, overrides: {}, qty: 1,
  });
  assert(narrow.warnings.some((w) => w.includes('595 mm wide')),
    'no warning for a 500 mm oven housing');
});

/* ------------------------------------------------------------------ *
 * Aggregation
 * ------------------------------------------------------------------ */

test('consolidation merges identical panels and preserves total quantity', () => {
  const a = expandCabinet(
    { type: 'floor', config: 'doors', width: 600, overrides: { doors: 2 }, qty: 3 },
  ).parts;
  const b = expandCabinet(
    { type: 'floor', config: 'doors', width: 600, overrides: { doors: 2 }, qty: 2 },
  ).parts;

  const before = [...a, ...b].reduce((n, p) => n + p.qty, 0);
  const merged = consolidate([...a, ...b]);
  const after = merged.reduce((n, p) => n + p.qty, 0);

  assert(before === after, `quantity changed on consolidation: ${before} -> ${after}`);
  assert(merged.length === a.length,
    `identical cabinets should merge to ${a.length} lines, got ${merged.length}`);
});

test('area and edging totals scale with quantity', () => {
  const one = expandCabinet(
    { type: 'floor', config: 'doors', width: 600, overrides: { doors: 2 }, qty: 1 },
  ).parts;
  const four = expandCabinet(
    { type: 'floor', config: 'doors', width: 600, overrides: { doors: 2 }, qty: 4 },
  ).parts;

  const close = (x, y) => Math.abs(x - y) < 1e-9;
  assert(close(totalArea(four), totalArea(one) * 4), 'area does not scale');
  assert(close(totalEdging(four), totalEdging(one) * 4), 'edging does not scale');
});

test('a part too large for a sheet is reported', () => {
  const huge = expandCabinet({
    type: 'tall', config: 'grocery', width: 600,
    overrides: { height: SHEET.length + 200 }, qty: 1,
  });
  assert(huge.warnings.some((w) => w.includes('will not fit')),
    'oversized panel was not reported');
});

export function runInvariants() {
  return checks.map(({ name, fn }) => {
    try {
      fn();
      return { name, status: 'pass' };
    } catch (err) {
      return { name, status: 'fail', detail: err.message };
    }
  });
}
