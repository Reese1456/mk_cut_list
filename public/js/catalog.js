import { OVEN_CABINET_MIN_WIDTH } from './constants.js';

/**
 * Cabinet catalogue - what the operator can choose, and what each choice needs.
 *
 * The engine in rules.js knows how to *build* a cabinet. This file describes
 * how to *offer* one: the names people use in the workshop, which options
 * apply to which cabinet, and the standard widths worth putting one click
 * away.
 *
 * Keeping these apart means the engine stays testable and the wording stays
 * easy to change without touching any maths.
 */

/**
 * Option fields a configuration can ask for.
 * `type` is how the field is presented; `options` are the allowed values.
 */
export const FIELDS = {
  doors: {
    label: 'Doors',
    type: 'choice',
    options: [
      { value: 1, label: '1 door' },
      { value: 2, label: '2 doors' },
    ],
    default: 1,
  },
  drawers: {
    label: 'Drawers',
    type: 'choice',
    options: [
      { value: 2, label: '2 deep' },
      { value: 3, label: '2 + 1 deep' },
      { value: 4, label: '4 equal' },
    ],
    default: 4,
  },
  runnerDepth: {
    label: 'Runner',
    type: 'choice',
    options: [270, 350, 450, 500].map((v) => ({ value: v, label: `${v} mm` })),
    default: 500,
  },
  legWidth: {
    label: 'Return leg',
    type: 'number',
    suffix: 'mm',
    default: null,
    hint: 'Width of the second leg. Leave blank to match the first.',
  },
  aperture: {
    label: 'Appliance',
    type: 'choice',
    options: [
      { value: 'single', label: 'Single oven (600)' },
      { value: 'double', label: 'Double oven (890)' },
      { value: 'compact', label: 'Compact / microwave (450)' },
    ],
    default: 'single',
  },
  apertureBottom: {
    label: 'Opening starts at',
    type: 'number',
    suffix: 'mm',
    default: 800,
    hint: 'Measured up from the inside of the cabinet bottom.',
  },
  shelves: {
    label: 'Shelves',
    type: 'number',
    default: null,
    hint: 'Leave blank for the standard number.',
  },
};

/**
 * Cabinet families. `configs` are the shapes each family can take; the `id`
 * of each pairs with the family to select a builder in rules.js.
 */
export const FAMILIES = [
  {
    id: 'floor',
    label: 'Floor unit',
    short: 'Floor',
    note: '720 high, 560 deep',
    widths: [150, 200, 300, 450, 500, 541, 600, 700, 750, 900, 1000, 1100, 1200],
    defaultWidth: 600,
    configs: [
      { id: 'doors', label: 'Doors', fields: ['doors', 'shelves'] },
      { id: 'drawers', label: 'Drawer stack', fields: ['drawers', 'runnerDepth'] },
      { id: 'bin', label: 'Bin unit', fields: ['runnerDepth'] },
      {
        id: 'oven', label: 'Oven housing', fields: [],
        minWidth: OVEN_CABINET_MIN_WIDTH,
      },
      { id: 'corner', label: 'Corner', fields: ['legWidth', 'shelves'], minWidth: 600 },
    ],
  },
  {
    id: 'wallTall',
    label: 'Wall unit - tall',
    short: 'Wall 1080',
    note: '1080 high, 300 deep',
    widths: [100, 200, 300, 464, 484, 500, 600, 745, 900],
    defaultWidth: 600,
    configs: [
      { id: 'doors', label: 'Doors', fields: ['doors', 'shelves'] },
      { id: 'corner', label: 'Corner', fields: ['legWidth'], minWidth: 450 },
      { id: 'flap', label: 'Appliance box', fields: ['shelves'], defaults: { height: 360, depth: 300 } },
    ],
  },
  {
    id: 'wallStd',
    label: 'Wall unit - standard',
    short: 'Wall 720',
    note: '720 high, 300 deep',
    widths: [150, 200, 290, 450, 500, 600, 750, 900],
    defaultWidth: 600,
    configs: [
      { id: 'doors', label: 'Doors', fields: ['doors', 'shelves'] },
      { id: 'corner', label: 'Corner', fields: ['legWidth'], minWidth: 450 },
      { id: 'flap', label: 'Appliance box', fields: ['shelves'], defaults: { height: 360, depth: 300 } },
    ],
  },
  {
    id: 'tall',
    label: 'Tall unit',
    short: 'Tall',
    note: '2296 high, 580 deep',
    widths: [300, 450, 600, 750, 900],
    defaultWidth: 600,
    configs: [
      { id: 'grocery', label: 'Grocery', fields: ['doors', 'shelves'] },
      { id: 'broom', label: 'Broom', fields: ['doors', 'shelves'] },
      // A built-in oven is about 595 mm wide, so 600 is the smallest housing
      // that can take one.
      {
        id: 'elo', label: 'Eye level oven',
        fields: ['aperture', 'apertureBottom', 'shelves'],
        minWidth: OVEN_CABINET_MIN_WIDTH,
      },
      { id: 'corner', label: 'Corner', fields: ['legWidth'], minWidth: 600 },
    ],
  },
  {
    id: 'bic',
    label: 'Built-in cupboard',
    short: 'BIC',
    note: '2500 high, 560 deep',
    widths: [450, 500, 750, 900, 1200],
    defaultWidth: 900,
    configs: [
      { id: 'run', label: 'Bay', fields: ['shelves'] },
    ],
  },
];

/** Look up a family by id. */
export function family(id) {
  return FAMILIES.find((f) => f.id === id);
}

/** Look up a configuration within a family. */
export function config(familyId, configId) {
  return family(familyId)?.configs.find((c) => c.id === configId);
}

/**
 * The standard widths worth offering for a shape.
 *
 * Widths live on the family, but not every shape can use all of them - a
 * corner unit has a minimum below which its return back panel has no width.
 * Offering a width that cannot be built is worse than not offering it.
 */
export function widthsFor(familyId, configId) {
  const fam = family(familyId);
  if (!fam) return [];
  const min = config(familyId, configId)?.minWidth ?? 0;
  return fam.widths.filter((w) => w >= min);
}

/** A width the shape can actually be built at. */
export function defaultWidthFor(familyId, configId) {
  const fam = family(familyId);
  const allowed = widthsFor(familyId, configId);
  if (allowed.includes(fam.defaultWidth)) return fam.defaultWidth;
  return allowed[0] ?? fam.defaultWidth;
}

/** The fields that apply to a given family and configuration. */
export function fieldsFor(familyId, configId) {
  const c = config(familyId, configId);
  if (!c) return [];
  return c.fields.map((id) => ({ id, ...FIELDS[id] }));
}

/**
 * Build a cabinet object with sensible defaults for a family and config.
 * Only fields the configuration actually uses are filled in, so a cabinet
 * never carries options that do not apply to it.
 */
export function makeCabinet(familyId, configId, width) {
  const fam = family(familyId);
  const overrides = {};
  for (const f of fieldsFor(familyId, configId)) {
    if (f.default !== null && f.default !== undefined) overrides[f.id] = f.default;
  }
  // Some shapes are a different size from the rest of their family - an
  // appliance box is a short, shallow wall unit.
  Object.assign(overrides, config(familyId, configId)?.defaults ?? {});
  return {
    id: newId(),
    type: familyId,
    config: configId,
    width: width ?? defaultWidthFor(familyId, configId),
    qty: 1,
    label: '',
    overrides,
  };
}

/** randomUUID is only available in secure contexts, so fall back when it is not. */
function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Height and depth can be overridden on any cabinet, so they are offered
 * everywhere rather than being listed by each shape. Width is always shown.
 */
export const SIZE_FIELDS = [
  { id: 'height', label: 'Height' },
  { id: 'depth', label: 'Depth' },
];

/** The job-level dimensions the operator can change, grouped for display. */
export const GLOBAL_FIELDS = [
  { id: 'floorHeight', label: 'Floor height', group: 'Floor units' },
  { id: 'floorDepth', label: 'Floor depth', group: 'Floor units' },
  { id: 'kickHeight', label: 'Kickplate height', group: 'Floor units' },
  { id: 'wallTallHeight', label: 'Tall wall height', group: 'Wall units' },
  { id: 'wallStdHeight', label: 'Std wall height', group: 'Wall units' },
  { id: 'wallDepth', label: 'Wall depth', group: 'Wall units' },
  { id: 'tallHeight', label: 'Tall height', group: 'Tall units' },
  { id: 'tallDepth', label: 'Tall depth', group: 'Tall units' },
  { id: 'bicHeight', label: 'BIC height', group: 'Built-in cupboards' },
  { id: 'bicDepth', label: 'BIC depth', group: 'Built-in cupboards' },
  { id: 'boardThickness', label: 'Board thickness', group: 'Board' },
];
