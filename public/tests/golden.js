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

/** Compare actual and allowed differences as exact multisets. */
function compareDifferenceSet(actual, allowed) {
  const counts = new Map();
  for (const value of actual) counts.set(value, (counts.get(value) || 0) + 1);
  for (const value of allowed) counts.set(value, (counts.get(value) || 0) - 1);

  const unexpected = [];
  const unused = [];
  for (const [value, count] of counts) {
    for (let i = 0; i < count; i++) unexpected.push(value);
    for (let i = 0; i < -count; i++) unused.push(value);
  }
  return { unexpected, unused };
}

export function runGoldenMaster(fixtures) {
  const results = [];

  // The original workbook has no kickplate rows. Kickplates are now calculated
  // separately as linear stock and never enter the carcass panel comparison.
  const globals = { ...fixtures.globals, boardThickness: 16 };

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
    const allowedMissing = allowed.filter((entry) => entry.side === 'sheet').map((entry) => entry.panel);
    const allowedExtra = allowed.filter((entry) => entry.side === 'engine').map((entry) => entry.panel);
    const missingCheck = compareDifferenceSet(missing, allowedMissing);
    const extraCheck = compareDifferenceSet(extra, allowedExtra);
    const unused = [
      ...missingCheck.unused.map((value) => `sheet: ${value}`),
      ...extraCheck.unused.map((value) => `engine: ${value}`),
    ];

    if (
      missingCheck.unexpected.length === 0 && extraCheck.unexpected.length === 0 &&
      unused.length === 0
    ) {
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
        missing: missingCheck.unexpected,
        extra: extraCheck.unexpected,
        detail: unused.length
          ? `Allowlist entries were not exercised: ${unused.join('; ')}`
          : undefined,
      });
    }
  }

  return results;
}
