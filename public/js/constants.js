/**
 * MKitchens Cutlist Manager - dimensional constants.
 *
 * Everything the engine cuts is derived from the values in this file plus a
 * cabinet width. If a number appears anywhere else in the codebase, it is a
 * bug - put it here and give it a name.
 *
 * All dimensions are millimetres.
 */

/** Job-level dimensions. The operator can change any of these per job. */
export const DEFAULT_GLOBALS = {
  boardThickness: 16,

  floorHeight: 720,
  floorDepth: 560,

  /** Plinth under the floor units. Carcass height plus this is the finished
   *  height the worktop sits on. */
  kickHeight: 100,

  wallTallHeight: 1080,
  wallStdHeight: 720,
  wallDepth: 300,

  tallHeight: 2296,
  tallDepth: 580,

  bicHeight: 2500,
  bicDepth: 560,
};

/**
 * Construction constants, normalised.
 *
 * Where the original spreadsheet used two different values for the same joint,
 * the value kept here is the one used by the majority of cabinets. Each such
 * decision is recorded in tests/diff-allowlist.js so the change is visible and
 * reviewable rather than silent.
 */
export const K = {
  /** Shelf set back from the front edge so it clears the door. */
  shelfSetback: 26,

  /** Structural shelf in tall units - sits nearer the front than a loose shelf. */
  fixedShelfSetback: 18,

  /** Depth of the fixing rail under a worktop. */
  cleatDepth: 125,

  /** Floor unit back sits above the base rather than between top and bottom. */
  floorBackReduction: 17,

  /** Side-to-side clearance for drawer runners, on top of the two carcass sides. */
  drawerRunnerAllowance: 58,

  /** Standard drawer box heights. */
  drawerBoxShallow: 127,
  drawerBoxDeep: 240,

  /** Gap around a door or drawer front. */
  frontReveal: 3,

  /** Extra height taken off a floor door when the kitchen uses a gola profile. */
  golaReduction: 35,

  /** Corner units set their return back panel off the adjacent leg by this much. */
  cornerBackOffset: 244,

  /** Fixed width of the narrow return back panel on a corner unit. */
  cornerBackNarrow: 300,

  /** Built-in cupboards share dividers between bays, so only one thickness is lost. */
  bicShelfReduction: 16,

  /** How far the plinth is set back from the front of a floor unit. */
  kickRecess: 50,

  /** Depth of a built-in cupboard cleat. */
  bicCleatDepth: 100,
};

/**
 * Appliance apertures for eye-level oven housings.
 *
 * Built-in ovens are made to drop into a 600 mm cabinet - the appliance itself
 * is about 595 mm wide. Heights below are the opening the carcass must leave.
 */
export const OVEN_APERTURES = {
  single: 600,
  double: 890,
  compact: 450, // microwave, combi oven, coffee machine, warming drawer
};

/**
 * The two floor-unit builds MKitchens uses. Carcass height and plinth height
 * are set separately - these are the pairs worth putting one click away.
 */
export const FLOOR_BUILDS = [
  { carcass: 720, kick: 150, label: '720 carcass + 150 kick' },
  { carcass: 780, kick: 100, label: '780 carcass + 100 kick' },
];

/** Plinth heights offered as quick picks. */
export const KICK_HEIGHTS = [100, 150];

/** Standard melamine sheet. Used only to warn when a part cannot be cut. */
export const SHEET = {
  length: 2750,
  width: 1830,
};
