/**
 * Catalogue integration tests.
 *
 * The engine and the interface are deliberately separate: rules.js knows how
 * to build a cabinet, catalog.js knows what to offer. That split is only safe
 * if every option the interface offers is one the engine can actually build -
 * otherwise the first person to pick it gets an error instead of a cut list.
 *
 * These tests walk the whole catalogue and check exactly that.
 */

import { expandCabinet } from '../js/rules.js';
import { FAMILIES, FIELDS, family, fieldsFor, makeCabinet, widthsFor } from '../js/catalog.js';

const checks = [];
const test = (name, fn) => checks.push({ name, fn });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

test('every catalogue option builds a real cabinet', () => {
  for (const fam of FAMILIES) {
    for (const cfg of fam.configs) {
      const cab = makeCabinet(fam.id, cfg.id);
      let result;
      try {
        result = expandCabinet({ ...cab, qty: 1 });
      } catch (err) {
        throw new Error(`${fam.label} / ${cfg.label}: ${err.message}`);
      }
      assert(result.parts.length > 0,
        `${fam.label} / ${cfg.label} produced no parts`);
    }
  }
});

test('every width the interface offers builds cleanly', () => {
  for (const fam of FAMILIES) {
    for (const cfg of fam.configs) {
      const offered = widthsFor(fam.id, cfg.id);
      assert(offered.length > 0, `${fam.label} / ${cfg.label} offers no widths at all`);
      for (const width of offered) {
        const cab = makeCabinet(fam.id, cfg.id, width);
        let result;
        try {
          result = expandCabinet({ ...cab, qty: 1 });
        } catch (err) {
          throw new Error(`${fam.label} / ${cfg.label} @ ${width}: ${err.message}`);
        }
        assert(result.warnings.length === 0,
          `${fam.label} / ${cfg.label} @ ${width}: ${result.warnings[0]}`);
        for (const p of result.parts) {
          assert(Number.isFinite(p.l) && Number.isFinite(p.w) && p.l > 0 && p.w > 0,
            `${fam.label} / ${cfg.label} @ ${width}: ${p.desc} is ${p.l}x${p.w}`);
        }
      }
    }
  }
});

test('every option a shape offers is one the engine reads', () => {
  // A field that changes nothing is worse than no field at all - it looks like
  // a control and does nothing. Each option is set to a distinctive value and
  // the resulting parts must differ from the default build.
  const probes = {
    doors: 2,
    drawers: 2,
    runnerDepth: 270,
    shelves: 5,
    legWidth: 800,
    aperture: 'double',
    apertureBottom: 1200,
    // Zero removes the plinth, which is a visible change to the panel list.
    kick: 0,
  };

  // Options that legitimately affect only the front list or validation, not
  // the carcass panels.
  const notPanelAffecting = new Set(['doors', 'aperture', 'apertureBottom']);

  for (const fam of FAMILIES) {
    for (const cfg of fam.configs) {
      const base = makeCabinet(fam.id, cfg.id);
      const baseParts = JSON.stringify(expandCabinet({ ...base, qty: 1 }).parts);

      for (const f of fieldsFor(fam.id, cfg.id)) {
        if (notPanelAffecting.has(f.id)) continue;
        assert(f.id in probes, `no probe value defined for field "${f.id}"`);

        const probed = makeCabinet(fam.id, cfg.id);
        probed.overrides[f.id] = probes[f.id];
        const probedParts = JSON.stringify(expandCabinet({ ...probed, qty: 1 }).parts);

        assert(probedParts !== baseParts,
          `${fam.label} / ${cfg.label}: changing "${f.label}" did not change anything`);
      }
    }
  }
});

test('a blank option falls back to the family default', () => {
  // The interface stores "leave blank for standard" as null. The engine uses
  // `??`, so null must behave exactly like the option being absent.
  for (const fam of FAMILIES) {
    for (const cfg of fam.configs) {
      const withNulls = makeCabinet(fam.id, cfg.id);
      const bare = makeCabinet(fam.id, cfg.id);

      for (const f of fieldsFor(fam.id, cfg.id)) {
        if (f.default === null || f.default === undefined) withNulls.overrides[f.id] = null;
      }

      const a = JSON.stringify(expandCabinet({ ...withNulls, qty: 1 }).parts);
      const b = JSON.stringify(expandCabinet({ ...bare, qty: 1 }).parts);
      assert(a === b, `${fam.label} / ${cfg.label}: a blank option changed the result`);
    }
  }
});

test('every field referenced by a shape is defined', () => {
  for (const fam of FAMILIES) {
    for (const cfg of fam.configs) {
      for (const id of cfg.fields) {
        assert(FIELDS[id], `${fam.label} / ${cfg.label} asks for unknown field "${id}"`);
      }
    }
  }
});

test('quantity multiplies every panel', () => {
  for (const fam of FAMILIES) {
    const cfg = fam.configs[0];
    const one = expandCabinet({ ...makeCabinet(fam.id, cfg.id), qty: 1 }).parts;
    const three = expandCabinet({ ...makeCabinet(fam.id, cfg.id), qty: 3 }).parts;
    assert(one.length === three.length, `${fam.label}: panel count changed with quantity`);
    for (let i = 0; i < one.length; i++) {
      assert(three[i].qty === one[i].qty * 3,
        `${fam.label}: ${one[i].desc} did not scale with quantity`);
    }
  }
});

test('families declare sane defaults', () => {
  for (const fam of FAMILIES) {
    assert(fam.widths.length > 0, `${fam.label} has no standard widths`);
    assert(fam.widths.includes(fam.defaultWidth),
      `${fam.label} default width ${fam.defaultWidth} is not among its standard widths`);
    for (const cfg of fam.configs) {
      assert(widthsFor(fam.id, cfg.id).length > 0,
        `${fam.label} / ${cfg.label} has no buildable standard width`);
    }
    assert(fam.configs.length > 0, `${fam.label} has no shapes`);
    assert(family(fam.id) === fam, `${fam.label} is not retrievable by id`);
  }
});

export function runCatalogTests() {
  return checks.map(({ name, fn }) => {
    try {
      fn();
      return { name, status: 'pass' };
    } catch (err) {
      return { name, status: 'fail', detail: err.message };
    }
  });
}
