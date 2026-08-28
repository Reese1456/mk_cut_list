/**
 * Width sweep.
 *
 * The old spreadsheet only ever had to handle 56 fixed widths. The new engine
 * accepts any width, so it has to be right at widths nobody has tried yet -
 * the 630 mm infill, the 1015 mm run against a wall.
 *
 * Every family and configuration is swept a millimetre at a time. The rule is
 * not "never produce a bad panel at any width" - a 60 mm cabinet genuinely
 * cannot be built. The rule is that the engine must never produce a bad panel
 * *silently*: either the parts are all sane, or validate() said why not.
 */

import { expandCabinet } from '../js/rules.js';

const CASES = [
  { type: 'floor',    config: 'doors',   overrides: { doors: 1 } },
  { type: 'floor',    config: 'doors',   overrides: { doors: 2 } },
  { type: 'floor',    config: 'drawers', overrides: { drawers: 2, runnerDepth: 500 } },
  { type: 'floor',    config: 'drawers', overrides: { drawers: 3, runnerDepth: 500 } },
  { type: 'floor',    config: 'drawers', overrides: { drawers: 4, runnerDepth: 500 } },
  { type: 'floor',    config: 'bin',     overrides: { runnerDepth: 500 } },
  { type: 'floor',    config: 'oven',    overrides: {} },
  { type: 'wallTall', config: 'doors',   overrides: { shelves: 2 } },
  { type: 'wallStd',  config: 'doors',   overrides: { shelves: 1 } },
  { type: 'wallStd',  config: 'flap',    overrides: { height: 360, depth: 300 } },
  { type: 'tall',     config: 'grocery', overrides: {} },
  { type: 'tall',     config: 'broom',   overrides: {} },
  { type: 'tall',     config: 'elo',     overrides: {} },
  { type: 'bic',      config: 'run',     overrides: { shelves: 3 } },
];

const FROM = 100;
const TO = 1200;

export function runSweep() {
  const failures = [];
  let cabinets = 0;
  let panels = 0;
  let warned = 0;

  for (const base of CASES) {
    const label = `${base.type}/${base.config}`;
    let previousCount = null;

    for (let width = FROM; width <= TO; width++) {
      const cab = { ...base, width, qty: 1 };
      cabinets++;

      let result;
      try {
        result = expandCabinet(cab);
      } catch (err) {
        failures.push(`${label} @ ${width}: threw "${err.message}"`);
        continue;
      }

      const { parts, warnings } = result;
      panels += parts.length;
      if (warnings.length) warned++;

      // A bad panel is only acceptable if the engine flagged the cabinet.
      const bad = parts.filter(
        (p) => !Number.isFinite(p.l) || !Number.isFinite(p.w) || p.l <= 0 || p.w <= 0,
      );
      if (bad.length && warnings.length === 0) {
        failures.push(
          `${label} @ ${width}: produced ${bad[0].desc} at ` +
          `${bad[0].l}x${bad[0].w} with no warning`,
        );
      }

      // NaN must never appear, warned or not.
      const nan = parts.filter((p) => Number.isNaN(p.l) || Number.isNaN(p.w) || Number.isNaN(p.qty));
      if (nan.length) {
        failures.push(`${label} @ ${width}: ${nan[0].desc} has a NaN dimension`);
      }

      // The number of panels must not jump about as width changes; a
      // discontinuity means a rule is branching on width when it should not.
      if (previousCount !== null && parts.length !== previousCount) {
        failures.push(
          `${label} @ ${width}: panel count changed from ${previousCount} to ${parts.length}`,
        );
      }
      previousCount = parts.length;

      // Canonical orientation must hold at every width.
      const misordered = parts.find((p) => p.l < p.w);
      if (misordered) {
        failures.push(
          `${label} @ ${width}: ${misordered.desc} is ${misordered.l}x${misordered.w}, ` +
          'not in canonical orientation',
        );
      }
    }
  }

  return {
    cabinets,
    panels,
    warned,
    failures: failures.slice(0, 20),
    failureCount: failures.length,
  };
}
