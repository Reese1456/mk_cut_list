/**
 * Invariant tests: properties that must hold for every cabinet the engine can
 * produce, whatever the width.
 *
 * The golden master proves the engine reproduces the spreadsheet. These prove
 * it does not produce nonsense for the widths the spreadsheet never covered -
 * which is the whole point of making it parametric.
 */

import {
  calculateKickplateRequirement, expandCabinet, fronts, resolve, consolidate,
  totalArea, totalEdging,
} from '../js/rules.js';
import {
  DEFAULT_GLOBALS, DEFAULT_KICKPLATE_SETTINGS, K, OVEN_CABINET_MIN_WIDTH, SHEET,
} from '../js/constants.js';
import { cutlistRows, toCsv } from '../js/csv.js';

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
  for (const thickness of [16, 18]) {
    const globals = { ...DEFAULT_GLOBALS, boardThickness: thickness };

    // Floor: back sits above the base, so it loses one board thickness plus
    // one millimetre of clearance.
    const floor = expandCabinet(
      { type: 'floor', config: 'doors', width: 600, overrides: { doors: 2 }, qty: 1 },
      globals,
    ).parts;
    const floorBack = floor.find((p) => p.desc === 'back');
    const expectedFloorHeight = DEFAULT_GLOBALS.floorHeight - thickness - K.floorBackClearance;
    const expectedInner = 600 - 2 * thickness;
    assert(floorBack.l === expectedFloorHeight,
      `T${thickness} floor back height ${floorBack.l}, expected ${expectedFloorHeight}`);
    assert(floorBack.w === expectedInner,
      `T${thickness} floor back width ${floorBack.w}, expected ${expectedInner}`);

    // Wall and tall: back sits between top and bottom.
    for (const [type, height] of [
      ['wallTall', DEFAULT_GLOBALS.wallTallHeight],
      ['wallStd', DEFAULT_GLOBALS.wallStdHeight],
    ]) {
      const parts = expandCabinet(
        { type, config: 'doors', width: 600, overrides: { shelves: 1 }, qty: 1 },
        globals,
      ).parts;
      const back = parts.find((p) => p.desc === 'back');
      const expectedHeight = height - 2 * thickness;
      assert(back.l === expectedHeight,
        `T${thickness} ${type} back height ${back.l}, expected ${expectedHeight}`);
    }
  }
});

test('built-in cupboard shared-divider width follows board thickness', () => {
  for (const thickness of [16, 18]) {
    const { parts } = expandCabinet(
      { type: 'bic', config: 'run', width: 900, overrides: {}, qty: 1 },
      { ...DEFAULT_GLOBALS, boardThickness: thickness },
    );
    const shelf = parts.find((p) => p.desc === 'shelves');
    const expected = 900 - thickness;
    assert(shelf.l === expected || shelf.w === expected,
      `T${thickness} BIC shelf is ${shelf.l}x${shelf.w}, expected width ${expected}`);
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

const STRAIGHT_FLOOR_CASES = [
  { config: 'doors', overrides: { doors: 2 } },
  { config: 'drawers', overrides: { drawers: 4 } },
  { config: 'bin', overrides: {} },
  { config: 'oven', overrides: {} },
];

test('the fresh floor defaults are 720 plus 150 and remain independent', () => {
  assert(DEFAULT_GLOBALS.floorHeight === 720,
    `fresh floor height is ${DEFAULT_GLOBALS.floorHeight}, expected 720`);
  assert(DEFAULT_GLOBALS.kickHeight === 150,
    `fresh kickplate height is ${DEFAULT_GLOBALS.kickHeight}, expected 150`);

  const tallerCarcass = { ...DEFAULT_GLOBALS, floorHeight: 780, kickHeight: 150 };
  const lowerKick = { ...DEFAULT_GLOBALS, floorHeight: 720, kickHeight: 100 };
  const cab = { type: 'floor', config: 'doors', width: 600, overrides: {}, qty: 1 };
  assert(resolve(cab, tallerCarcass).H === 780,
    'changing the carcass height did not remain independent');
  assert(calculateKickplateRequirement([cab], {}, tallerCarcass).kickHeight === 150,
    'changing the carcass height changed the kickplate height');
  assert(resolve(cab, lowerKick).H === 720,
    'changing the kickplate height changed the carcass height');
  assert(calculateKickplateRequirement([cab], {}, lowerKick).kickHeight === 100,
    'the independently changed kickplate height was not used');
});

test('kickplate stock sums straight floor fronts, quantities and end returns', () => {
  const cabinets = [
    { type: 'floor', config: 'doors', width: 600, qty: 2 },
    { type: 'floor', config: 'drawers', width: 450, qty: 1 },
    { type: 'floor', config: 'oven', width: 600, qty: 1 },
    { type: 'wallStd', config: 'doors', width: 900, qty: 4 },
    { type: 'tall', config: 'grocery', width: 600, qty: 2 },
    { type: 'bic', config: 'run', width: 900, qty: 3 },
  ];
  const settings = {
    ...DEFAULT_KICKPLATE_SETTINGS,
    material: 'wood', endCount: 2, endDepth: 560,
  };
  const result = calculateKickplateRequirement(cabinets, settings);

  // 2x600 doors + 450 drawers + 600 oven = 2250; 2x560 ends = 1120.
  assert(result.frontLength === 2250,
    `straight frontage ${result.frontLength}, expected 2250`);
  assert(result.endLength === 1120,
    `end returns ${result.endLength}, expected 1120`);
  assert(result.requiredLength === 3370,
    `total ${result.requiredLength}, expected 3370`);
  assert(result.stockLength === 2700 && result.lengthsRequired === 2,
    `wood stock ${result.lengthsRequired} x ${result.stockLength}, expected 2 x 2700`);
  assert(result.orderedLength === 5400 && result.spareLength === 2030,
    `wood order/spare ${result.orderedLength}/${result.spareLength}, expected 5400/2030`);
  assert(result.complete && result.warnings.length === 0,
    `valid calculation warned: ${result.warnings.join('; ')}`);

  const followsJobDepth = calculateKickplateRequirement([], {
    ...DEFAULT_KICKPLATE_SETTINGS, endCount: 2, endDepth: null,
  }, { ...DEFAULT_GLOBALS, floorDepth: 580 });
  assert(followsJobDepth.endLength === 1160,
    `blank end depth gave ${followsJobDepth.endLength}, expected 2 x 580 = 1160`);

  const explicitDepth = calculateKickplateRequirement([], {
    ...DEFAULT_KICKPLATE_SETTINGS, endCount: 2, endDepth: 510,
  }, { ...DEFAULT_GLOBALS, floorDepth: 580 });
  assert(explicitDepth.endLength === 1020,
    `explicit end depth gave ${explicitDepth.endLength}, expected 2 x 510 = 1020`);
});

test('kickplate stock rounds up at each material boundary', () => {
  for (const [material, stockLength] of [['wood', 2700], ['aluminium', 3000]]) {
    const exact = calculateKickplateRequirement([
      { type: 'floor', config: 'bin', width: stockLength / 3, qty: 3 },
    ], { ...DEFAULT_KICKPLATE_SETTINGS, material });
    assert(exact.lengthsRequired === 1 && exact.spareLength === 0,
      `${material}: exact ${stockLength} mm did not need one length`);

    const over = calculateKickplateRequirement([
      { type: 'floor', config: 'bin', width: stockLength / 3, qty: 3 },
    ], {
      ...DEFAULT_KICKPLATE_SETTINGS,
      material, endCount: 1, endDepth: 1,
    });
    assert(over.lengthsRequired === 2,
      `${material}: ${stockLength + 1} mm did not round up to two lengths`);
  }
});

test('floor corners require a measured allowance without guessing geometry', () => {
  const cabinets = [
    { type: 'floor', config: 'doors', width: 600, qty: 1 },
    { type: 'floor', config: 'corner', width: 900, qty: 2 },
  ];
  const unresolved = calculateKickplateRequirement(cabinets, {
    ...DEFAULT_KICKPLATE_SETTINGS, cornerAllowance: null,
  });
  assert(unresolved.frontLength === 600 && unresolved.cornerUnits === 2,
    'corner widths leaked into the automatic frontage');
  assert(!unresolved.complete && unresolved.lengthsRequired === null,
    'an unresolved corner produced a stock quantity');
  assert(unresolved.warnings.some((w) => w.includes('combined measured allowance')),
    'the unresolved corner did not ask for a measurement');

  const covered = calculateKickplateRequirement(cabinets, {
    ...DEFAULT_KICKPLATE_SETTINGS,
    cornerAllowance: 0,
    cornerSignature: unresolved.cornerSignature,
  });
  assert(covered.complete && covered.requiredLength === 600,
    'explicit zero should confirm adjoining runs cover the corners');

  const measured = calculateKickplateRequirement(cabinets, {
    ...DEFAULT_KICKPLATE_SETTINGS,
    cornerAllowance: 850,
    cornerSignature: unresolved.cornerSignature,
  });
  assert(measured.complete && measured.requiredLength === 1450,
    `measured corner total ${measured.requiredLength}, expected 1450`);

  const changedQuantity = calculateKickplateRequirement([
    cabinets[0],
    { ...cabinets[1], qty: 3 },
  ], {
    ...DEFAULT_KICKPLATE_SETTINGS,
    cornerAllowance: 850,
    cornerSignature: unresolved.cornerSignature,
  });
  assert(!changedQuantity.complete && changedQuantity.lengthsRequired === null,
    'a corner quantity change reused the old combined measurement');
  assert(changedQuantity.cornerMeasurementStale &&
    changedQuantity.warnings.some((w) => w.includes('layout changed')),
    'a changed corner did not request a fresh measurement');

  const changedAdjoiningRun = calculateKickplateRequirement([
    { ...cabinets[0], width: 750 },
    cabinets[1],
  ], {
    ...DEFAULT_KICKPLATE_SETTINGS,
    cornerAllowance: 0,
    cornerSignature: unresolved.cornerSignature,
  });
  assert(!changedAdjoiningRun.complete && changedAdjoiningRun.cornerMeasurementStale,
    'an adjoining straight-cupboard change reused the old corner coverage decision');
});

test('invalid kickplate calculator inputs fail closed', () => {
  const straight = [{ type: 'floor', config: 'doors', width: 600, qty: 1 }];
  const corner = [{ type: 'floor', config: 'corner', width: 900, qty: 1 }];
  const cases = [
    calculateKickplateRequirement(straight, { endCount: 1.5 }),
    calculateKickplateRequirement(straight, { endCount: 1, endDepth: -1 }),
    calculateKickplateRequirement(straight, { material: 'steel' }),
    calculateKickplateRequirement(straight, { material: 'constructor' }),
    calculateKickplateRequirement(straight, { material: 'toString' }),
    calculateKickplateRequirement(straight, { material: '__proto__' }),
    calculateKickplateRequirement(corner, { cornerAllowance: -1 }),
    calculateKickplateRequirement([], { endCount: 1e308, endDepth: 1e308 }),
    calculateKickplateRequirement([], { endCount: 2, endDepth: 1e308 }),
    calculateKickplateRequirement([{ ...straight[0], width: 1e308, qty: 2 }]),
    calculateKickplateRequirement(corner, { cornerAllowance: 1e308 }),
    calculateKickplateRequirement([{ ...straight[0], qty: 0 }]),
    calculateKickplateRequirement([{ ...straight[0], width: -1 }]),
  ];

  for (const result of cases) {
    assert(!result.complete && result.lengthsRequired === null,
      'invalid kickplate input produced a stock quantity');
    assert(result.warnings.length > 0, 'invalid kickplate input produced no warning');
    for (const key of [
      'frontLength', 'endLength', 'cornerLength', 'requiredLength',
      'stockLength', 'orderedLength', 'spareLength',
    ]) {
      assert(result[key] === null || Number.isFinite(result[key]),
        `invalid kickplate input left ${key} as ${result[key]}`);
    }
  }
});

test('kickplate stock never becomes a carcass panel or CSV row', () => {
  const all = [];
  for (const build of STRAIGHT_FLOOR_CASES) {
    const result = expandCabinet({
      type: 'floor', config: build.config, width: 600, qty: 1,
      // Old browser presets may still carry this now-inert override.
      overrides: { ...build.overrides, kick: 150 },
    });
    assert(!result.parts.some((p) => p.desc === 'kickplate'),
      `${build.config}: kickplate leaked into the carcass panels`);
    all.push(...result.parts);
  }

  const csv = toCsv(cutlistRows({}, consolidate(all)));
  assert(!/kickplate|aluminium/i.test(csv),
    'kickplate stock leaked into the carcass CSV');
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

test('both oven housing styles enforce the 600 mm nominal width', () => {
  for (const [type, config] of [['floor', 'oven'], ['tall', 'elo']]) {
    const narrow = expandCabinet({
      type, config, width: OVEN_CABINET_MIN_WIDTH - 1, overrides: {}, qty: 1,
    });
    assert(narrow.warnings.some((w) => w.includes('needs a 600 mm cabinet')),
      `${type}/${config}: no warning at ${OVEN_CABINET_MIN_WIDTH - 1} mm`);

    const standard = expandCabinet({
      type, config, width: OVEN_CABINET_MIN_WIDTH, overrides: {}, qty: 1,
    });
    assert(!standard.warnings.some((w) => w.includes('needs a 600 mm cabinet')),
      `${type}/${config}: warned at the standard ${OVEN_CABINET_MIN_WIDTH} mm width`);
  }
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

test('invalid quantities and panel counts cannot reach the cut list', () => {
  const cases = [
    {
      label: 'zero quantity',
      cab: { type: 'floor', config: 'doors', width: 600, overrides: {}, qty: 0 },
    },
    {
      label: 'negative quantity',
      cab: { type: 'floor', config: 'doors', width: 600, overrides: {}, qty: -2 },
    },
    {
      label: 'fractional quantity',
      cab: { type: 'floor', config: 'doors', width: 600, overrides: {}, qty: 1.5 },
    },
    {
      label: 'unsafe huge quantity',
      cab: { type: 'floor', config: 'doors', width: 600, overrides: {}, qty: 1e308 },
    },
    {
      label: 'negative shelves',
      cab: {
        type: 'floor', config: 'doors', width: 600,
        overrides: { shelves: -1 }, qty: 1,
      },
    },
    {
      label: 'fractional shelves',
      cab: {
        type: 'floor', config: 'doors', width: 600,
        overrides: { shelves: 1.5 }, qty: 1,
      },
    },
  ];

  for (const { label, cab } of cases) {
    const result = expandCabinet(cab);
    assert(result.parts.length === 0, `${label}: invalid panels reached output`);
    assert(result.warnings.some((warning) => warning.includes('whole number')),
      `${label}: no useful warning`);
  }

  for (const cab of [
    {
      type: 'floor', config: 'doors', width: 600,
      overrides: {}, qty: Number.MAX_SAFE_INTEGER,
    },
    {
      type: 'floor', config: 'doors', width: 600,
      overrides: { shelves: Number.MAX_SAFE_INTEGER }, qty: 2,
    },
  ]) {
    const result = expandCabinet(cab);
    assert(result.parts.length === 0, 'unsafe multiplied panel quantity reached output');
    assert(result.warnings.some((warning) => warning.includes('too large')),
      'unsafe multiplied panel quantity produced no useful warning');
  }
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
