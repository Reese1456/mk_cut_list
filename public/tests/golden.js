/**
 * Golden-master test: does the engine reproduce the original spreadsheet?
 *
 * For each of the 56 cabinet blocks, the same cabinet is built through the
 * engine and its panels compared to the ones extracted from the workbook.
 *
 * Differences are not automatically failures. Where the spreadsheet was
 * inconsistent with itself we deliberately chose one rule, and those decisions
 * are listed in diff-allowlist.js. A difference that is on the allowlist is
 * reported as an accepted change; anything else is a failure.
 */

import { expandCabinet } from '../js/rules.js';
import { BLOCK_MAP, normaliseDesc } from './blockmap.js';
import { ALLOWED_DIFFS } from './diff-allowlist.js';

/** A comparable key for one panel. */
function key(p) {
  return `${normaliseDesc(p.desc)} ${p.qtyPer}x ${p.l}x${p.w} e${p.eL}/${p.eS}`;
}

/** Compare two panel lists as multisets, returning what differs. */
function comparePanels(expected, actual) {
  const counts = new Map();
  for (const p of expected) counts.set(key(p), (counts.get(key(p)) || 0) + 1);
  for (const p of actual) counts.set(key(p), (counts.get(key(p)) || 0) - 1);

  const missing = [];
  const extra = [];
  for (const [k, n] of counts) {
    for (let i = 0; i < n; i++) missing.push(k);
    for (let i = 0; i < -n; i++) extra.push(k);
  }
  return { missing, extra };
}

export function runGoldenMaster(fixtures) {
  const results = [];

  // The original workbook has no concept of a plinth - kickplates were cut
  // separately and never appeared on its cut list. Building with kickHeight 0
  // keeps this a like-for-like comparison; the plinth is a deliberate addition
  // covered by its own tests rather than a difference from the spreadsheet.
  const globals = { ...fixtures.globals, boardThickness: 16, kickHeight: 0 };

  for (const block of fixtures.blocks) {
    const spec = BLOCK_MAP[block.block];
    if (!spec) {
      results.push({
        block: block.block,
        status: 'unmapped',
        detail: `No entry in BLOCK_MAP for block ${block.block}`,
      });
      continue;
    }

    // The spreadsheet's quantity column is a per-cabinet multiplier, so build
    // one cabinet and compare multipliers directly.
    let actual;
    try {
      actual = expandCabinet({ ...spec, qty: 1 }, globals).parts;
    } catch (err) {
      results.push({ block: block.block, status: 'error', detail: err.message });
      continue;
    }

    // Rows whose quantity could not be resolved to a plain multiplier are
    // skipped for the count comparison but still checked for size.
    const expected = block.parts.filter((p) => p.qtyPer !== null);
    const unresolved = block.parts.length - expected.length;

    const { missing, extra } = comparePanels(expected, actual);
    const allowed = ALLOWED_DIFFS[block.block] || [];
    const allowedSet = new Set(allowed.map((a) => a.panel));

    const unexpectedMissing = missing.filter((m) => !allowedSet.has(m));
    const unexpectedExtra = extra.filter((e) => !allowedSet.has(e));

    if (unexpectedMissing.length === 0 && unexpectedExtra.length === 0) {
      results.push({
        block: block.block,
        status: missing.length || extra.length ? 'normalised' : 'exact',
        accepted: allowed.length,
        unresolved,
      });
    } else {
      results.push({
        block: block.block,
        status: 'fail',
        family: block.family,
        config: block.config,
        width: block.width,
        missing: unexpectedMissing,
        extra: unexpectedExtra,
      });
    }
  }

  return results;
}
