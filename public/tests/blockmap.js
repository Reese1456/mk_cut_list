/**
 * Maps each cabinet block in the original spreadsheet to the equivalent
 * cabinet object for the new engine.
 *
 * This is the bridge that makes the golden-master test possible: for every one
 * of the 56 blocks, build the same cabinet through the engine and check the
 * panels match.
 *
 * Keys are the block's header row on the `cut list` sheet, so any entry can be
 * traced straight back to the workbook.
 */

export const BLOCK_MAP = {
  /* ---------------- floor units ---------------- */

  11:  { type: 'floor', config: 'doors',   width: 541,  overrides: { doors: 1 } },
  18:  { type: 'floor', config: 'oven',    width: 600,  overrides: {} },
  24:  { type: 'floor', config: 'doors',   width: 600,  overrides: { doors: 2 } },
  31:  { type: 'floor', config: 'drawers', width: 600,  overrides: { drawers: 4, runnerDepth: 500 } },
  40:  { type: 'floor', config: 'drawers', width: 700,  overrides: { drawers: 3, runnerDepth: 500 } },
  51:  { type: 'floor', config: 'drawers', width: 600,  overrides: { drawers: 2, runnerDepth: 500 } },
  60:  { type: 'floor', config: 'doors',   width: 750,  overrides: { doors: 2 } },
  67:  { type: 'floor', config: 'drawers', width: 750,  overrides: { drawers: 3, runnerDepth: 500 } },
  78:  { type: 'floor', config: 'corner',  width: 900,  overrides: { shelves: 3 } },
  84:  { type: 'floor', config: 'corner',  width: 1000, overrides: { shelves: 3, legWidth: 900 } },
  91:  { type: 'floor', config: 'doors',   width: 900,  overrides: { doors: 2 } },
  98:  { type: 'floor', config: 'drawers', width: 900,  overrides: { drawers: 3, runnerDepth: 500 } },
  109: { type: 'floor', config: 'doors',   width: 1000, overrides: { doors: 2 } },
  116: { type: 'floor', config: 'doors',   width: 1100, overrides: { doors: 2 } },
  123: { type: 'floor', config: 'doors',   width: 1200, overrides: { doors: 2 } },
  130: { type: 'floor', config: 'doors',   width: 1200, overrides: { doors: 2 } },
  137: { type: 'floor', config: 'doors',   width: 300,  overrides: { doors: 1 } },
  144: { type: 'floor', config: 'doors',   width: 450,  overrides: { doors: 1 } },
  151: { type: 'floor', config: 'drawers', width: 450,  overrides: { drawers: 4, runnerDepth: 500 } },
  160: { type: 'floor', config: 'drawers', width: 450,  overrides: { drawers: 3, runnerDepth: 500 } },
  171: { type: 'floor', config: 'bin',     width: 450,  overrides: { runnerDepth: 500 } },
  180: { type: 'floor', config: 'doors',   width: 200,  overrides: { doors: 1 } },
  187: { type: 'floor', config: 'doors',   width: 150,  overrides: { doors: 1 } },

  /* ---------------- tall wall units ---------------- */

  194: { type: 'wallTall', config: 'doors',  width: 900, overrides: { doors: 2, shelves: 2 } },
  200: { type: 'wallTall', config: 'doors',  width: 745, overrides: { doors: 2, shelves: 2 } },
  206: { type: 'wallTall', config: 'corner', width: 600, overrides: { legWidth: 600 } },
  212: { type: 'wallTall', config: 'doors',  width: 484, overrides: { doors: 1, shelves: 2 } },
  218: { type: 'wallTall', config: 'doors',  width: 464, overrides: { doors: 1, shelves: 2 } },
  224: { type: 'wallTall', config: 'doors',  width: 500, overrides: { doors: 1, shelves: 2, depth: 450 } },

  // Appliance box above a wall unit - shallow, no shelf.
  230: { type: 'wallTall', config: 'flap',   width: 600, overrides: { height: 360, depth: 300, shelves: 0 } },

  235: { type: 'wallTall', config: 'doors',  width: 300, overrides: { doors: 1, shelves: 2 } },
  241: { type: 'wallTall', config: 'doors',  width: 200, overrides: { doors: 1, shelves: 2 } },

  // Fault 7: the source cuts the sides 450 deep but the top and bottom 300.
  // Mapped at the depth the sides are cut, which is what the carcass needs.
  247: { type: 'wallTall', config: 'doors',  width: 100, overrides: { doors: 1, shelves: 2, depth: 450 } },

  /* ---------------- standard wall units ---------------- */

  253: { type: 'wallStd', config: 'doors', width: 900, overrides: { doors: 2, shelves: 1 } },
  259: { type: 'wallStd', config: 'doors', width: 750, overrides: { doors: 2, shelves: 1 } },
  265: { type: 'wallStd', config: 'doors', width: 600, overrides: { doors: 1, shelves: 1 } },
  271: { type: 'wallStd', config: 'doors', width: 600, overrides: { doors: 2, shelves: 1 } },

  // Microwave / appliance box.
  277: { type: 'wallStd', config: 'flap',  width: 900, overrides: { height: 360, depth: 300, shelves: 0 } },

  282: { type: 'wallStd', config: 'doors', width: 450, overrides: { doors: 1, shelves: 1 } },

  // Fault 4: the source has this shelf at quantity zero, so it is never cut.
  // Mapped with the shelf it was clearly meant to have.
  288: { type: 'wallStd', config: 'flap',  width: 500, overrides: { height: 360, depth: 300, shelves: 1 } },

  // No shelf in the source, unlike its 200 mm neighbour. Left as built - see
  // the open question in the blueprint.
  294: { type: 'wallStd', config: 'doors', width: 290, overrides: { doors: 1, shelves: 0 } },

  299: { type: 'wallStd', config: 'doors', width: 200, overrides: { doors: 1, shelves: 1 } },
  305: { type: 'wallStd', config: 'doors', width: 150, overrides: { doors: 1, shelves: 1 } },

  /* ---------------- tall units ---------------- */

  311: { type: 'tall', config: 'grocery', width: 900, overrides: { doors: 2, fixedShelves: 2, shelves: 3 } },
  318: { type: 'tall', config: 'corner',  width: 920, overrides: { legWidth: 920, shelves: 4 } },
  327: { type: 'tall', config: 'grocery', width: 750, overrides: { doors: 2, fixedShelves: 2, shelves: 3 } },
  334: { type: 'tall', config: 'grocery', width: 600, overrides: { doors: 1, fixedShelves: 2, shelves: 3 } },
  341: { type: 'tall', config: 'grocery', width: 450, overrides: { doors: 1, fixedShelves: 1, shelves: 4 } },
  348: { type: 'tall', config: 'grocery', width: 300, overrides: { doors: 1, fixedShelves: 2, shelves: 3 } },

  355: { type: 'tall', config: 'broom',   width: 600, overrides: { doors: 1, fixedShelves: 1, shelves: 1 } },
  362: { type: 'tall', config: 'broom',   width: 450, overrides: { doors: 1, fixedShelves: 1, shelves: 1 } },
  369: { type: 'tall', config: 'broom',   width: 300, overrides: { doors: 1, fixedShelves: 2, shelves: 1 } },

  /* ---------------- built-in cupboards ---------------- */

  376: { type: 'bic', config: 'run', width: 750,  overrides: { shelves: 3, cleats: 3 } },
  380: { type: 'bic', config: 'run', width: 900,  overrides: { shelves: 3, cleats: 3 } },
  384: { type: 'bic', config: 'run', width: 1200, overrides: { shelves: 3, cleats: 3 } },
  388: { type: 'bic', config: 'run', width: 500,  overrides: { shelves: 6, cleats: 2 } },
};

/**
 * Descriptions differ in spelling and plurality between the spreadsheet and
 * the engine ("shelf" / "shelves" / "sHelves"). Both sides are reduced to
 * these names before comparison.
 */
export const DESC_ALIASES = {
  'sides': 'side',
  'side': 'side',
  'base': 'base',
  'shelf': 'shelf',
  'shelves': 'shelf',
  'left shelves': 'left shelf',
  'right shelves': 'right shelf',
  'fixed shelf': 'fixed shelf',
  'cleat': 'cleat',
  'cleats': 'cleat',
  'back': 'back',
  'back 1': 'back 1',
  'back 2': 'back 2',
  'top and bottom': 'top and bottom',
  'draw inner fr back': 'drawer front and back',
  'draw base': 'drawer base',
  'draw sides': 'drawer side',
};

export function normaliseDesc(d) {
  const key = String(d).trim().toLowerCase();
  return DESC_ALIASES[key] || key;
}
