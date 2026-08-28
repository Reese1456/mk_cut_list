/**
 * Accepted differences between the original spreadsheet and the new engine.
 *
 * Every entry here is a deliberate decision, not a tolerance. Where the
 * spreadsheet used two different rules for the same joint, we picked the one
 * used by the majority of cabinets and recorded the change here so it can be
 * reviewed against real jobs rather than discovered on the saw.
 *
 * Anything NOT in this list that differs is a test failure.
 *
 * `panel` strings must match the comparison key exactly:
 *     "<description> <qtyPer>x <l>x<w> e<eL>/<eS>"
 *
 * `side` records which version the line came from, purely for reporting.
 * Fault numbers refer to the register in the project blueprint.
 */

const change = (sheet, engine, reason, fault) => [
  { panel: sheet, side: 'sheet', reason, fault },
  { panel: engine, side: 'engine', reason, fault },
];

export const ALLOWED_DIFFS = {
  /* ---------------------------------------------------------------- *
   * Fault 17 - cleat depth
   * The 150 floor unit is the only cabinet with a 100 mm cleat.
   * Every other floor unit uses 125 mm.
   * ---------------------------------------------------------------- */
  187: change(
    'cleat 1x 118x100 e1/0',
    'cleat 1x 125x118 e0/1',
    'Cleat depth standardised to 125 mm, as used by every other floor unit.',
    17,
  ),

  /* ---------------------------------------------------------------- *
   * Fault 15 - wall unit back height
   * High wall units cut the back at H-33; standard wall units and tall
   * units use H-32, which is the correct two-board-thickness reduction.
   * Effect: every high wall back gains 1 mm.
   * ---------------------------------------------------------------- *
   * Fault 14 - shelf setback
   * The 900 high wall is the only shelf in the workbook set back 20 mm.
   * Every other shelf uses 26 mm.
   * ---------------------------------------------------------------- */
  194: [
    ...change(
      'back 1x 1047x868 e0/0',
      'back 1x 1048x868 e0/0',
      'Back height standardised to H-32 (two board thicknesses).',
      15,
    ),
    ...change(
      'shelf 2x 868x280 e1/0',
      'shelf 2x 868x274 e1/0',
      'Shelf setback standardised to 26 mm.',
      14,
    ),
  ],

  200: change('back 1x 1047x713 e0/0', 'back 1x 1048x713 e0/0',
    'Back height standardised to H-32.', 15),
  212: change('back 1x 1047x452 e0/0', 'back 1x 1048x452 e0/0',
    'Back height standardised to H-32.', 15),
  218: change('back 1x 1047x432 e0/0', 'back 1x 1048x432 e0/0',
    'Back height standardised to H-32.', 15),
  224: change('back 1x 1047x468 e0/0', 'back 1x 1048x468 e0/0',
    'Back height standardised to H-32.', 15),
  241: change('back 1x 1047x168 e0/0', 'back 1x 1048x168 e0/0',
    'Back height standardised to H-32.', 15),

  /* ---------------------------------------------------------------- *
   * The 300 high wall bands its shelf on the depth edge rather than the
   * front edge. Its 200 mm neighbour bands the front. The front edge is
   * the one you see, so the engine bands that.
   * ---------------------------------------------------------------- */
  235: [
    ...change(
      'back 1x 1047x268 e0/0',
      'back 1x 1048x268 e0/0',
      'Back height standardised to H-32.',
      15,
    ),
    ...change(
      'shelf 2x 274x268 e1/0',
      'shelf 2x 274x268 e0/1',
      'Shelf banded on the front edge (268 mm) rather than the side edge, ' +
      'matching the 200 mm unit.',
      14,
    ),
  ],

  /* ---------------------------------------------------------------- *
   * Fault 7 - the 100 high wall cuts its sides 450 deep but its top and
   * bottom only 300, so the carcass cannot assemble square. Built at the
   * depth the sides are cut.
   * ---------------------------------------------------------------- */
  247: [
    ...change(
      'top and bottom 2x 300x68 e0/1',
      'top and bottom 2x 450x68 e0/1',
      'Top and bottom cut to the same 450 mm depth as the sides.',
      7,
    ),
    ...change(
      'back 1x 1047x68 e0/0',
      'back 1x 1048x68 e0/0',
      'Back height standardised to H-32.',
      15,
    ),
    ...change(
      'shelf 2x 426x68 e0/1',
      'shelf 2x 424x68 e0/1',
      'Shelf setback standardised to 26 mm (was 24 mm).',
      14,
    ),
  ],

  /* ---------------------------------------------------------------- *
   * Fault 4 - the 500 std wall shelf has a hard-typed quantity of zero,
   * so it is never cut. Restored, and set back like every other shelf.
   * ---------------------------------------------------------------- */
  288: change(
    'shelf 0x 468x300 e1/0',
    'shelf 1x 468x274 e1/0',
    'Shelf restored (source quantity was hard-typed 0) and set back 26 mm.',
    4,
  ),

  /* ---------------------------------------------------------------- *
   * Fault 5 - the 450 grocery back is cut using the cabinet depth in
   * place of the internal width: 2264 x 580 instead of 2264 x 418. That
   * panel cannot fit the carcass.
   *
   * Fault 16 - the same cabinet uses -17 and -27 where the tall family
   * uses -18 and -26, and omits its shelf banding.
   * ---------------------------------------------------------------- */
  341: [
    ...change(
      'back 1x 2264x580 e0/0',
      'back 1x 2264x418 e0/0',
      'Back width corrected to the internal width (W-32). The source used ' +
      'the cabinet depth, producing a panel that does not fit.',
      5,
    ),
    ...change(
      'fixed shelf 1x 563x418 e0/1',
      'fixed shelf 1x 562x418 e0/1',
      'Fixed shelf setback standardised to 18 mm.',
      16,
    ),
    ...change(
      'shelf 4x 553x418 e0/0',
      'shelf 4x 554x418 e0/1',
      'Shelf setback standardised to 26 mm and front edge banded, matching ' +
      'the rest of the tall family.',
      16,
    ),
  ],

  /* ---------------------------------------------------------------- *
   * The 600 broom uses H-33 for its back and -17 for its fixed shelf,
   * where the rest of the tall family uses H-32 and -18.
   * ---------------------------------------------------------------- */
  355: [
    ...change(
      'back 1x 2263x568 e0/0',
      'back 1x 2264x568 e0/0',
      'Back height standardised to H-32.',
      15,
    ),
    ...change(
      'fixed shelf 1x 568x563 e1/0',
      'fixed shelf 1x 568x562 e1/0',
      'Fixed shelf setback standardised to 18 mm.',
      16,
    ),
  ],

  /* ---------------------------------------------------------------- *
   * Fault 18 - the 500 bic is the only bay banding both edges of its
   * shelves. The other three band the front edge only.
   * ---------------------------------------------------------------- */
  388: change(
    'shelf 6x 560x484 e1/1',
    'shelf 6x 560x484 e0/1',
    'Shelf banded on the front edge only, matching the other bic bays.',
    18,
  ),
};

/** Every accepted change, flattened - used to print the review report. */
export function allChanges() {
  const out = [];
  for (const [block, entries] of Object.entries(ALLOWED_DIFFS)) {
    const seen = new Set();
    for (const e of entries) {
      const id = `${block}|${e.reason}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const pair = entries.filter((x) => x.reason === e.reason);
      out.push({
        block: Number(block),
        fault: e.fault,
        reason: e.reason,
        sheet: pair.find((x) => x.side === 'sheet')?.panel,
        engine: pair.find((x) => x.side === 'engine')?.panel,
      });
    }
  }
  return out.sort((a, b) => a.block - b.block);
}
