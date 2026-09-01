/**
 * MKitchens Cutlist Manager - the cutting engine.
 *
 * Pure functions only. Nothing in this file touches the DOM, reads global
 * state, or has side effects. Give it a cabinet, get back panels. That is what
 * makes it testable against the original spreadsheet.
 *
 * ---------------------------------------------------------------------------
 * Panel orientation
 * ---------------------------------------------------------------------------
 * A panel is built with two named dimensions, `a` and `b`, and records which
 * of its edges are banded: `edgeA` is the number of banded edges that run the
 * length of `a`, `edgeB` likewise for `b`.
 *
 * Building panels this way - rather than as "long edge / short edge" - means a
 * narrow cabinet whose depth exceeds its width cannot silently end up with the
 * banding on the wrong side. `canon()` sorts the dimensions at the very end,
 * once, when the part is about to be shown or exported.
 * ---------------------------------------------------------------------------
 */

import {
  DEFAULT_GLOBALS, DEFAULT_KICKPLATE_SETTINGS, K, KICKPLATE_MATERIALS,
  OVEN_APERTURES, OVEN_CABINET_MIN_WIDTH, SHEET,
} from './constants.js';

/* ------------------------------------------------------------------ *
 * Panel helpers
 * ------------------------------------------------------------------ */

/**
 * Build a panel.
 * @param {string} desc  what the panel is, as the workshop would name it
 * @param {number} qtyPer  how many per cabinet
 * @param {number} a  first dimension
 * @param {number} b  second dimension
 * @param {number} edgeA  banded edges running the length of `a`
 * @param {number} edgeB  banded edges running the length of `b`
 */
function panel(desc, qtyPer, a, b, edgeA = 0, edgeB = 0) {
  return { desc, qtyPer, a, b, edgeA, edgeB };
}

/**
 * Put a panel into canonical orientation: longer dimension first, with each
 * edge count following its dimension.
 */
export function canon(p) {
  const flip = p.b > p.a;
  return {
    desc: p.desc,
    qtyPer: p.qtyPer,
    l: flip ? p.b : p.a,
    w: flip ? p.a : p.b,
    eL: flip ? p.edgeB : p.edgeA,
    eS: flip ? p.edgeA : p.edgeB,
  };
}

/* ------------------------------------------------------------------ *
 * Dimension resolution
 * ------------------------------------------------------------------ */

/** Family defaults: which global height and depth each cabinet family uses. */
const FAMILY_DIMS = {
  floor: (g) => ({ height: g.floorHeight, depth: g.floorDepth }),
  wallTall: (g) => ({ height: g.wallTallHeight, depth: g.wallDepth }),
  wallStd: (g) => ({ height: g.wallStdHeight, depth: g.wallDepth }),
  tall: (g) => ({ height: g.tallHeight, depth: g.tallDepth }),
  bic: (g) => ({ height: g.bicHeight, depth: g.bicDepth }),
};

/**
 * Work out the dimensions a cabinet actually uses, applying any per-cabinet
 * overrides on top of the family defaults.
 */
export function resolve(cab, globals = DEFAULT_GLOBALS) {
  const g = { ...DEFAULT_GLOBALS, ...globals };
  const dims = FAMILY_DIMS[cab.type];
  if (!dims) throw new Error(`Unknown cabinet type: ${cab.type}`);

  const base = dims(g);
  const o = cab.overrides || {};

  return {
    W: cab.width,
    H: o.height ?? base.height,
    D: o.depth ?? base.depth,
    T: g.boardThickness,
    globals: g,
  };
}

/* ------------------------------------------------------------------ *
 * Carcass builders
 * ------------------------------------------------------------------ */

/**
 * Floor unit carcass: two sides, a base, an optional shelf, a cleat and a back.
 * The back sits above the base, so it loses less height than a wall unit's.
 */
function floorCarcass({ W, H, D, T }, { shelves = 1, cleats = 1, back = true }) {
  const inner = W - 2 * T;
  const parts = [
    panel('sides', 2, H, D, 1, 0),
    panel('base', 1, inner, D, 1, 0),
  ];
  if (shelves > 0) parts.push(panel('shelf', shelves, inner, D - K.shelfSetback, 1, 0));
  if (cleats > 0) parts.push(panel('cleat', cleats, inner, K.cleatDepth, 1, 0));
  if (back) parts.push(panel('back', 1, H - T - K.floorBackClearance, inner, 0, 0));

  return parts;
}

/**
 * Wall unit carcass: two sides, a top and a bottom, a back and shelves.
 * Sides are banded on the front edge and the bottom, both being visible.
 */
function wallCarcass({ W, H, D, T }, { shelves = 1, back = true }) {
  const inner = W - 2 * T;
  const parts = [
    panel('sides', 2, H, D, 1, 1),
    panel('top and bottom', 2, inner, D, 1, 0),
  ];
  if (back) parts.push(panel('back', 1, H - 2 * T, inner, 0, 0));
  if (shelves > 0) parts.push(panel('shelves', shelves, inner, D - K.shelfSetback, 1, 0));
  return parts;
}

/**
 * Tall unit carcass. Same shape as a wall unit but with structural fixed
 * shelves in addition to loose ones.
 */
function tallCarcass({ W, H, D, T }, { fixedShelves = 2, shelves = 3, back = true }) {
  const inner = W - 2 * T;
  const parts = [
    panel('sides', 2, H, D, 1, 1),
    panel('top and bottom', 2, inner, D, 1, 0),
  ];
  if (back) parts.push(panel('back', 1, H - 2 * T, inner, 0, 0));
  if (fixedShelves > 0) {
    parts.push(panel('fixed shelf', fixedShelves, inner, D - K.fixedShelfSetback, 1, 0));
  }
  if (shelves > 0) parts.push(panel('shelves', shelves, inner, D - K.shelfSetback, 1, 0));
  return parts;
}

/* ------------------------------------------------------------------ *
 * Drawers
 * ------------------------------------------------------------------ */

/**
 * Drawer box parts for a stack.
 *
 * @param groups  e.g. [{ height: 127, count: 2 }, { height: 240, count: 1 }]
 * @param runner  runner depth (500 / 450 / 350 / 270)
 */
function drawerParts({ W, T }, groups, runner) {
  const boxWidth = W - 2 * T - K.drawerRunnerAllowance;
  const total = groups.reduce((n, grp) => n + grp.count, 0);
  const parts = [];

  for (const grp of groups) {
    parts.push(panel('draw inner fr back', grp.count * 2, boxWidth, grp.height, 1, 0));
  }
  parts.push(panel('draw base', total, boxWidth, runner - 2 * T, 0, 0));
  for (const grp of groups) {
    parts.push(panel('draw sides', grp.count * 2, runner, grp.height, 1, 0));
  }
  return parts;
}

/** The standard drawer stacks, by drawer count. */
const DRAWER_STACKS = {
  4: [{ height: K.drawerBoxShallow, count: 4 }],
  3: [
    { height: K.drawerBoxShallow, count: 2 },
    { height: K.drawerBoxDeep, count: 1 },
  ],
  2: [{ height: K.drawerBoxDeep, count: 2 }],
};

/* ------------------------------------------------------------------ *
 * Fronts (doors and drawer fronts)
 * ------------------------------------------------------------------ */

/**
 * Door and drawer-front sizes.
 *
 * Not part of the v1 cut list - fronts are usually a different material and
 * often a different supplier - but computed here so the rule lives in one
 * place when the front list is added.
 *
 * The stack fills `H - reveal`, with a reveal between each front. That
 * reproduces the spreadsheet's 4-drawer stack exactly and, unlike the
 * spreadsheet, keeps working when the floor height changes.
 */
export function fronts(cab, globals = DEFAULT_GLOBALS) {
  const { W, H } = resolve(cab, globals);
  const o = cab.overrides || {};
  const gap = K.frontReveal;
  const gola = globals.gola && cab.type === 'floor' ? K.golaReduction : 0;
  const available = H - gap - gola;

  if (cab.config === 'drawers') {
    const n = o.drawers ?? 4;
    const width = W - gap;
    if (n === 4) {
      const h = (available - 3 * gap) / 4;
      return [{ desc: 'draw front', qtyPer: 4, height: h, width }];
    }
    if (n === 2) {
      const h = (available - gap) / 2;
      return [{ desc: 'draw front', qtyPer: 2, height: h, width }];
    }
    // Three drawers: two shallow plus one deep at twice the shallow height.
    const usable = available - 2 * gap;
    const shallow = Math.floor(usable / 4);
    return [
      { desc: 'draw front', qtyPer: 2, height: shallow, width },
      { desc: 'draw front', qtyPer: 1, height: usable - 2 * shallow, width },
    ];
  }

  const doors = o.doors ?? 1;
  return [{ desc: 'door', qtyPer: doors, height: available, width: W / doors - gap }];
}

/* ------------------------------------------------------------------ *
 * Configurations
 * ------------------------------------------------------------------ */

/**
 * Each builder receives resolved dimensions and the cabinet's overrides, and
 * returns an array of panels. Adding a cabinet type means adding one entry.
 */
const BUILDERS = {
  /* ---- floor ---- */

  'floor/doors': (d, o) =>
    floorCarcass(d, {
      shelves: o.shelves ?? 1,
      cleats: o.cleats ?? 1,
      back: o.back ?? true,
    }),

  'floor/drawers': (d, o) => {
    const n = o.drawers ?? 4;
    const stack = DRAWER_STACKS[n];
    if (!stack) throw new Error(`No standard stack for ${n} drawers`);
    return [
      ...floorCarcass(d, {
        shelves: o.shelves ?? 0,
        cleats: o.cleats ?? 1,
        back: o.back ?? true,
      }),
      ...drawerParts(d, stack, o.runnerDepth ?? 500),
    ];
  },

  /**
   * Bin unit: a floor carcass with a single bin drawer. The bin drawer's
   * front and back panels are a one-off size in the source workbook and are
   * reproduced here rather than normalised, having no family to be consistent
   * with.
   */
  'floor/bin': (d, o) => {
    const runner = o.runnerDepth ?? 500;
    const boxWidth = d.W - 2 * d.T - K.drawerRunnerAllowance;
    return [
      ...floorCarcass(d, {
        shelves: o.shelves ?? 0,
        cleats: o.cleats ?? 1,
        back: o.back ?? true,
      }),
      panel('draw inner fr back', 2, 400, boxWidth, 2, 1),
      panel('draw base', 1, boxWidth, runner - 2 * d.T, 0, 0),
      panel('draw sides', 2, runner, K.drawerBoxDeep, 1, 0),
    ];
  },

  /**
   * Under-counter oven housing. The base and cleats run the full cabinet
   * width rather than the internal width - see question 3 in the blueprint.
   * Reproduced as built until that is confirmed.
   */
  'floor/oven': (d, o) => {
    const rail = o.railDepth ?? 100;
    return [
      panel('sides', 2, d.H, rail, 1, 0),
      panel('base', 1, d.W, d.D, 1, 0),
      panel('shelf', 1, d.W - 2 * d.T, rail, 1, 0),
      panel('cleat', 2, d.W, rail, 1, 0),
    ];
  },

  /** L-shaped floor corner. `legWidth` is the width of the return leg. */
  'floor/corner': (d, o) => {
    const leg = o.legWidth ?? d.W;
    const innerMain = d.W - 2 * d.T;
    const innerLeg = leg - 2 * d.T;
    const parts = [
      panel('sides', 2, d.H, d.D, 1, 0),
      panel('shelf', o.shelves ?? 3, innerLeg, innerMain, 0, 0),
      panel('back 1', 1, d.H, K.cornerBackNarrow, 0, 0),
    ];
    if (leg === d.W) {
      parts.push(panel('back 2', 2, d.H, d.W - K.cornerBackOffset, 0, 0));
    } else {
      parts.push(panel('back 2', 1, d.H, d.W - K.cornerBackOffset, 0, 0));
      parts.push(panel('back 2', 1, d.H, leg - K.cornerBackOffset, 0, 0));
    }
    // Its kickplate is measured manually in the separate stock calculator;
    // never guess one main strip, two leg strips, or adjoining-run coverage.
    return parts;
  },

  /* ---- wall ---- */

  'wall/doors': (d, o) => wallCarcass(d, { shelves: o.shelves ?? 1, back: o.back ?? true }),

  /**
   * Wall corner. The source workbook labels the two full-height return panels
   * "shelves"; they are kept at their built size here and named for what they
   * are.
   */
  'wall/corner': (d, o) => {
    const leg = o.legWidth ?? d.W;
    return [
      panel('sides', 2, d.H, d.D, 1, 1),
      panel('top and bottom', 4, d.W - 2 * d.T, leg - 2 * d.T, 1, 0),
      panel('back', 1, d.H, o.cornerPost ?? 119, 2, 2),
      panel('shelves', 2, d.H, d.W - 116, 1, 1),
    ];
  },

  /** Flap / appliance box: a shallow wall carcass with no shelf. */
  'wall/flap': (d, o) => wallCarcass(d, { shelves: o.shelves ?? 0, back: o.back ?? true }),

  /* ---- tall ---- */

  'tall/grocery': (d, o) =>
    tallCarcass(d, {
      fixedShelves: o.fixedShelves ?? 2,
      shelves: o.shelves ?? 3,
      back: o.back ?? true,
    }),

  'tall/broom': (d, o) =>
    tallCarcass(d, {
      fixedShelves: o.fixedShelves ?? 1,
      shelves: o.shelves ?? 1,
      back: o.back ?? true,
    }),

  /**
   * Eye level oven housing.
   *
   * Structurally a grocery carcass with an appliance aperture between its two
   * fixed shelves - the aperture itself consumes no board. Loose shelves
   * default to one above the oven and one below.
   *
   * `aperture` is a key of OVEN_APERTURES, or a number for a non-standard
   * appliance. `apertureBottom` is measured from the inside face of the
   * cabinet bottom to the underside of the oven.
   */
  'tall/elo': (d, o) =>
    tallCarcass(d, {
      fixedShelves: o.fixedShelves ?? 2,
      shelves: o.shelves ?? 2,
      back: o.back ?? true,
    }),

  /** Tall corner. Two legs, wrap-around backs, shelves in each leg. */
  'tall/corner': (d, o) => {
    const leg = o.legWidth ?? d.W;
    return [
      panel('sides', 2, d.H, d.D, 1, 1),
      panel('top and bottom', 2, leg - 2 * d.T, d.W - 2 * d.T, 0, 0),
      panel('back', 1, d.H, K.cornerBackNarrow, 0, 0),
      panel('fixed shelf', 1, d.H, leg - K.cornerBackOffset, 0, 0),
      panel('fixed shelf', 1, d.H, d.W - K.cornerBackOffset, 0, 0),
      panel('left shelves', o.shelves ?? 4, leg - 2 * d.T, o.leftShelfDepth ?? 400, 1, 0),
      panel('right shelves', o.shelves ?? 4, d.W - 2 * d.T, o.rightShelfDepth ?? 350, 1, 0),
    ];
  },

  /* ---- built-in cupboards ---- */

  /**
   * Built-in cupboard bay. Bays in a run share their dividers, so a shelf
   * loses one board thickness rather than two.
   */
  'bic/run': (d, o) => {
    const shelfWidth = d.W - d.T;
    return [
      panel('sides', 2, d.H, d.D, 1, 0),
      panel('shelves', o.shelves ?? 3, shelfWidth, d.D, 1, 0),
      panel('cleats', o.cleats ?? 3, shelfWidth, K.bicCleatDepth, 1, 0),
    ];
  },
};

/* ------------------------------------------------------------------ *
 * Kickplate stock calculator
 * ------------------------------------------------------------------ */

const STRAIGHT_FLOOR_CONFIGS = new Set(['doors', 'drawers', 'bin', 'oven']);

/** Length arithmetic must stay finite and exact enough to represent millimetres. */
function isSafeLength(value) {
  return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
}

/** A corner allowance is valid only for this exact floor-cupboard layout. */
function cornerMeasurementSignature(cabinets, globals) {
  const rows = cabinets
    .map((cab, index) => ({ cab, index }))
    .filter(({ cab }) => cab?.type === 'floor')
    .map(({ cab, index }) => [
      cab.id ?? `position-${index}`,
      cab.config,
      cab.width,
      cab.qty ?? 1,
      cab.overrides?.depth ?? globals.floorDepth,
      cab.config === 'corner' ? (cab.overrides?.legWidth ?? cab.width) : null,
    ]);
  return JSON.stringify(rows);
}

/**
 * Calculate the linear kickplate stock for a job without adding it to the
 * carcass-panel list. Straight floor fronts are automatic. End returns use the
 * operator's count and depth, while corner geometry remains a manual allowance.
 */
export function calculateKickplateRequirement(
  cabinets = [],
  settings = DEFAULT_KICKPLATE_SETTINGS,
  globals = DEFAULT_GLOBALS,
) {
  const g = { ...DEFAULT_GLOBALS, ...(globals || {}) };
  const s = { ...DEFAULT_KICKPLATE_SETTINGS, ...(settings || {}) };
  const warnings = [];
  let complete = true;
  let frontLength = 0;
  let cornerUnits = 0;

  if (!Array.isArray(cabinets)) {
    warnings.push('The cabinet list is invalid, so no automatic frontage was counted.');
    complete = false;
    cabinets = [];
  }

  const cornerSignature = cornerMeasurementSignature(cabinets, g);

  for (const cab of cabinets) {
    if (!cab || cab.type !== 'floor') continue;

    const qty = cab.qty ?? 1;
    if (!Number.isSafeInteger(qty) || qty < 1) {
      warnings.push(
        `A floor cabinet has quantity ${qty}; its kickplate length was not counted.`,
      );
      complete = false;
      continue;
    }

    if (cab.config === 'corner') {
      cornerUnits += qty;
      continue;
    }
    if (!STRAIGHT_FLOOR_CONFIGS.has(cab.config)) continue;

    if (!isSafeLength(cab.width) || cab.width <= 0) {
      warnings.push(
        `A ${cab.config} floor cabinet has width ${cab.width}; its kickplate length was not counted.`,
      );
      complete = false;
      continue;
    }
    const contribution = cab.width * qty;
    const nextFrontLength = frontLength + contribution;
    if (!isSafeLength(contribution) || !isSafeLength(nextFrontLength)) {
      warnings.push(
        `A ${cab.config} floor cabinet produces a kickplate length too large to calculate safely.`,
      );
      complete = false;
      continue;
    }
    frontLength = nextFrontLength;
  }

  const endCount = s.endCount;
  const endDepth = s.endDepth === null || s.endDepth === undefined || s.endDepth === ''
    ? g.floorDepth
    : s.endDepth;
  let endLength = 0;
  if (!Number.isSafeInteger(endCount) || endCount < 0) {
    warnings.push(`End-cupboard count must be a non-negative whole number. This one is ${endCount}.`);
    complete = false;
  } else if (endCount > 0) {
    if (!isSafeLength(endDepth) || endDepth <= 0) {
      warnings.push(`End depth must be greater than zero. This one is ${endDepth}.`);
      complete = false;
    } else {
      const calculatedEndLength = endCount * endDepth;
      if (!isSafeLength(calculatedEndLength)) {
        warnings.push('The combined end-return length is too large to calculate safely.');
        complete = false;
      } else {
        endLength = calculatedEndLength;
      }
    }
  }

  let cornerLength = 0;
  const cornerProvided = s.cornerAllowance !== null &&
    s.cornerAllowance !== undefined && s.cornerAllowance !== '';
  const cornerMeasurementStale = cornerProvided && s.cornerSignature !== cornerSignature;
  if (cornerUnits > 0) {
    if (!cornerProvided) {
      warnings.push(
        `${cornerUnits} floor corner ${cornerUnits === 1 ? 'cupboard is' : 'cupboards are'} ` +
        'excluded from the automatic total. Enter their combined measured allowance.',
      );
      complete = false;
    } else if (!isSafeLength(s.cornerAllowance) || s.cornerAllowance < 0) {
      warnings.push(
        `Corner allowance must be zero or a positive length. This one is ${s.cornerAllowance}.`,
      );
      complete = false;
    } else if (cornerMeasurementStale) {
      warnings.push(
        'The floor-cupboard layout changed after the corners were measured. ' +
        'Enter their new combined allowance.',
      );
      complete = false;
    } else {
      cornerLength = s.cornerAllowance;
    }
  }

  const hasMaterial = Object.prototype.hasOwnProperty.call(KICKPLATE_MATERIALS, s.material);
  const material = hasMaterial ? KICKPLATE_MATERIALS[s.material] : null;
  if (!material) {
    warnings.push(`Unknown kickplate material: ${s.material}.`);
    complete = false;
  }

  const kickHeight = g.kickHeight;
  if (!isSafeLength(kickHeight) || kickHeight <= 0) {
    warnings.push(`Kickplate height must be greater than zero. This one is ${kickHeight}.`);
    complete = false;
  }

  const requiredLength = frontLength + endLength + cornerLength;
  if (!isSafeLength(requiredLength)) {
    warnings.push('The total kickplate length is too large to calculate safely.');
    complete = false;
  }
  const stockLength = material?.stockLength ?? 0;
  let lengthsRequired = null;
  let orderedLength = null;
  if (complete) {
    lengthsRequired = requiredLength > 0 ? Math.ceil(requiredLength / stockLength) : 0;
    const calculatedOrderLength = lengthsRequired * stockLength;
    if (!Number.isSafeInteger(lengthsRequired) || !isSafeLength(calculatedOrderLength)) {
      warnings.push('The stock quantity is too large to calculate safely.');
      complete = false;
      lengthsRequired = null;
    } else {
      orderedLength = calculatedOrderLength;
    }
  }

  return {
    material: s.material,
    materialLabel: material?.label ?? s.material,
    kickHeight,
    frontLength,
    endCount,
    endDepth,
    endLength,
    cornerUnits,
    cornerLength,
    cornerSignature,
    cornerMeasurementStale,
    requiredLength,
    stockLength,
    lengthsRequired,
    orderedLength,
    spareLength: orderedLength === null ? null : orderedLength - requiredLength,
    complete,
    warnings,
  };
}

/** Which builder handles a given cabinet. */
function builderKey(cab) {
  const familyGroup = cab.type === 'wallTall' || cab.type === 'wallStd' ? 'wall' : cab.type;
  return `${familyGroup}/${cab.config}`;
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

/** Invalid discrete inputs must fail closed before they become order rows. */
function fatalInputWarnings(cab, globals = DEFAULT_GLOBALS) {
  const warnings = [];
  const qty = cab.qty ?? 1;
  if (!Number.isSafeInteger(qty) || qty < 1) {
    warnings.push(`Quantity must be a positive whole number. This one is ${qty}.`);
  }

  const o = cab.overrides || {};
  for (const [key, label] of [
    ['shelves', 'Shelf count'],
    ['fixedShelves', 'Fixed-shelf count'],
    ['cleats', 'Cleat count'],
  ]) {
    const value = o[key];
    if (value !== null && value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
      warnings.push(`${label} must be a non-negative whole number. This one is ${value}.`);
    }
  }

  return warnings;
}

/**
 * Check a cabinet for things that would waste board or fail on the saw.
 * Returns an array of human-readable warnings - never throws.
 */
export function validate(cab, globals = DEFAULT_GLOBALS) {
  const warnings = fatalInputWarnings(cab, globals);
  const d = resolve(cab, globals);
  const o = cab.overrides || {};

  if (!(d.W > 0)) warnings.push('Width must be greater than zero.');
  if (d.W <= 2 * d.T) {
    warnings.push(
      `A ${d.W} mm cabinet has no internal width once both ${d.T} mm sides are allowed for.`,
    );
  }
  if (d.D <= K.shelfSetback) {
    warnings.push(`A depth of ${d.D} mm is too shallow to take a shelf.`);
  }
  if (!Number.isInteger(d.W)) {
    warnings.push(`Width ${d.W} mm is not a whole millimetre.`);
  }

  // Corner units set their return back panel off the adjacent leg, so a
  // narrow corner would produce a back with no width at all.
  if (cab.config === 'corner') {
    const leg = o.legWidth ?? d.W;
    const minimum = K.cornerBackOffset + 2 * d.T;
    for (const [name, value] of [['width', d.W], ['return leg', leg]]) {
      if (value <= minimum) {
        warnings.push(
          `A corner unit needs a ${name} over ${minimum} mm - the return back ` +
          `panel is set ${K.cornerBackOffset} mm off the adjacent leg. This one is ${value} mm.`,
        );
      }
    }
  }

  // Both oven styles take a nominal 600 mm cabinet. Catalogue minimums keep
  // standard picks safe; this check also covers manually typed widths.
  const isOvenHousing = cab.config === 'elo' || (cab.type === 'floor' && cab.config === 'oven');
  if (isOvenHousing && d.W < OVEN_CABINET_MIN_WIDTH) {
    warnings.push(
      `A built-in oven is about 595 mm wide and needs a ${OVEN_CABINET_MIN_WIDTH} mm cabinet. ` +
      `This one is ${d.W} mm.`,
    );
  }

  // Eye level ovens: does the appliance actually fit vertically?
  if (cab.config === 'elo') {
    const aperture = typeof o.aperture === 'number'
      ? o.aperture
      : OVEN_APERTURES[o.aperture ?? 'single'];
    const bottom = o.apertureBottom ?? 800;
    const needed = bottom + aperture + 2 * d.T;
    if (needed > d.H - 2 * d.T) {
      warnings.push(
        `Oven aperture does not fit: ${bottom} mm below the opening plus a ` +
        `${aperture} mm opening needs ${needed} mm, but the carcass has only ` +
        `${d.H - 2 * d.T} mm inside.`,
      );
    }
  }

  return warnings;
}

/* ------------------------------------------------------------------ *
 * Expansion
 * ------------------------------------------------------------------ */

/**
 * Expand one cabinet into its panels.
 *
 * @returns {{ parts: Array, warnings: string[] }} parts are in canonical
 *   orientation with `qty` already multiplied by the cabinet quantity.
 */
export function expandCabinet(cab, globals = DEFAULT_GLOBALS) {
  const key = builderKey(cab);
  const build = BUILDERS[key];
  if (!build) throw new Error(`No rule for ${key}`);

  // A fractional/negative count must not make it as far as the supplier file.
  // Return the normal warning shape with no panels so the UI can show the
  // problem while failing closed.
  if (fatalInputWarnings(cab, globals).length) {
    return { parts: [], warnings: validate(cab, globals) };
  }

  const d = resolve(cab, globals);
  const raw = build(d, cab.overrides || {});
  const qty = cab.qty ?? 1;

  const warnings = validate(cab, globals);
  const unsafeQuantity = raw.find((p) =>
    !Number.isSafeInteger(p.qtyPer) || p.qtyPer < 1 ||
    !Number.isSafeInteger(p.qtyPer * qty));
  if (unsafeQuantity) {
    warnings.push(
      `${unsafeQuantity.desc} quantity is too large to calculate safely. ` +
      'No panels were produced for this cabinet.',
    );
    return { parts: [], warnings };
  }

  const parts = raw.map((p) => {
    const c = canon(p);
    if (c.l > SHEET.length || c.w > SHEET.width) {
      warnings.push(
        `${c.desc} at ${c.l} x ${c.w} mm will not fit a ${SHEET.length} x ${SHEET.width} sheet.`,
      );
    }
    if (c.w <= 0) warnings.push(`${c.desc} has a width of ${c.w} mm.`);
    return {
      ...c,
      qty: c.qtyPer * qty,
      cabinet: cab.label || describeCabinet(cab),
    };
  });

  return { parts, warnings };
}

/** Expand every cabinet in a job. */
export function expandJob(job) {
  const globals = { ...DEFAULT_GLOBALS, ...(job.globals || {}) };
  const parts = [];
  const warnings = [];

  for (const cab of job.cabinets || []) {
    const result = expandCabinet(cab, globals);
    parts.push(...result.parts);
    for (const w of result.warnings) {
      warnings.push({ cabinet: cab.label || describeCabinet(cab), message: w });
    }
  }

  return { parts, warnings };
}

/**
 * Merge identical panels across cabinets into single lines.
 * The board supplier wants "14 of 568 x 560", not fourteen separate rows.
 */
export function consolidate(parts) {
  const merged = new Map();

  for (const p of parts) {
    const key = [p.desc, p.l, p.w, p.eL, p.eS].join('|');
    const existing = merged.get(key);
    if (existing) {
      existing.qty += p.qty;
      existing.cabinets.add(p.cabinet);
    } else {
      merged.set(key, { ...p, cabinets: new Set([p.cabinet]) });
    }
  }

  return [...merged.values()]
    .map((p) => ({ ...p, cabinets: [...p.cabinets] }))
    .sort((a, b) => b.l - a.l || b.w - a.w || a.desc.localeCompare(b.desc));
}

/** A short readable name for a cabinet, used when the operator has not set one. */
export function describeCabinet(cab) {
  const prefix = { floor: 'F', wallTall: 'WH', wallStd: 'W', tall: 'T', bic: 'BIC' }[cab.type] || '?';
  const o = cab.overrides || {};
  const bits = [`${prefix}${cab.width}`];

  if (cab.config === 'doors') bits.push(`${o.doors ?? 1}-door`);
  else if (cab.config === 'drawers') bits.push(`${o.drawers ?? 4}-drawer`);
  else if (cab.config === 'elo') bits.push(`elo ${o.aperture ?? 'single'}`);
  else bits.push(cab.config);

  return bits.join(' ');
}

/** Total board area in square metres, for a quick sanity check on quantities. */
export function totalArea(parts) {
  return parts.reduce((sum, p) => sum + (p.l / 1000) * (p.w / 1000) * p.qty, 0);
}

/** Total edge banding in metres. */
export function totalEdging(parts) {
  return parts.reduce(
    (sum, p) => sum + ((p.eL * p.l + p.eS * p.w) / 1000) * p.qty,
    0,
  );
}
