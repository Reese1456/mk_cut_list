import { validateJob, validateCabinet, encodeFile, decodeFile } from './portable.js';
/**
 * MKitchens Cutlist Manager - interface.
 *
 * Holds the job in memory, renders it, and asks the engine what to cut.
 * All the arithmetic lives in rules.js; nothing in this file calculates a
 * panel size.
 *
 * Rendering is deliberately split in two. The cabinet cards are built once
 * and updated in place, so typing in a field never rebuilds the element under
 * the cursor. The cutting list is cheap to rebuild, so it is redrawn whole on
 * every change.
 */

import {
  calculateKickplateRequirement, expandCabinet, consolidate, totalArea,
  totalEdging, describeCabinet, resolve,
} from './rules.js';
import {
  DEFAULT_GLOBALS, DEFAULT_KICKPLATE_SETTINGS, KICKPLATE_MATERIALS,
} from './constants.js';
import { cutlistRows, toCsv, cutlistFilename, downloadCsv } from './csv.js';
import {
  FAMILIES, family, config, fieldsFor, makeCabinet, widthsFor, defaultWidthFor,
  SIZE_FIELDS, GLOBAL_FIELDS,
} from './catalog.js';

const DRAFT_KEY = 'mkitchens.cutlist.draft';
const PRESET_KEY = 'mkitchens.cutlist.presets';
const DISPLAY_KEY = 'mkitchens.cutlist.display';

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

const state = {
  job: { client: '', reference: '', boardColour: '', edgeColour: '', gola: false },
  globals: { ...DEFAULT_GLOBALS },
  kickplate: { ...DEFAULT_KICKPLATE_SETTINGS },
  cabinets: [],
  view: 'by-cabinet',
};

/** Cabinet setups the operator has saved to reuse. */
let presets = [];

/** Cards the operator has expanded. Kept out of the saved draft. */
const openCards = new Set();

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

const $ = (sel) => document.querySelector(sel);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Build a labelled form control. */
function field(labelText, control, hint) {
  const wrap = el('div', 'field');
  const label = el('label', null, labelText);
  const id = control.id || `f-${uid()}`;
  control.id = id;
  label.setAttribute('for', id);
  wrap.append(label, control);
  if (hint) wrap.append(el('div', 'hint', hint));
  return wrap;
}

function numberInput(value, { min, max, step = 1, placeholder } = {}) {
  const input = document.createElement('input');
  input.type = 'number';
  if (min !== undefined) input.min = min;
  if (max !== undefined) input.max = max;
  input.step = step;
  if (placeholder) input.placeholder = placeholder;
  input.value = value ?? '';
  return input;
}

function selectInput(options, value) {
  const select = document.createElement('select');
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = String(opt.value);
    o.textContent = opt.label;
    if (String(opt.value) === String(value)) o.selected = true;
    select.append(o);
  }
  // Set it on the select too. Relying on an option's `selected` flag alone is
  // the kind of thing that works until an element is moved in the DOM.
  select.value = String(value ?? options[0]?.value ?? '');
  return select;
}

/* ------------------------------------------------------------------ *
 * Saving the working draft
 *
 * This makes sure a
 * half-entered kitchen survives an accidental refresh.
 * ------------------------------------------------------------------ */

let saveTimer = null;

function saveDraft() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const { job, globals, kickplate, cabinets, view } = state;
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ job, globals, kickplate, cabinets, view, activeJob }),
      );
    } catch {
      // Private windows and blocked site data both throw here. Losing the
      // draft is survivable; breaking the page is not.
    }
  }, 250);
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    activeJob = typeof saved.activeJob === 'string' ? saved.activeJob : null;
    if (saved.job) Object.assign(state.job, saved.job);
    if (saved.globals) Object.assign(state.globals, saved.globals);
    if (saved.kickplate) Object.assign(state.kickplate, saved.kickplate);
    if (Array.isArray(saved.cabinets)) state.cabinets = saved.cabinets;
    if (saved.view) state.view = saved.view;
  } catch {
    // A corrupt draft should never stop the app loading.
  }
}

/* ------------------------------------------------------------------ *
 * Saved presets
 * ------------------------------------------------------------------ */

function loadPresets() {
  try {
    const raw = localStorage.getItem(PRESET_KEY);
    presets = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(presets)) presets = [];
  } catch {
    presets = [];
  }
}

function savePresets() {
  try {
    localStorage.setItem(PRESET_KEY, JSON.stringify(presets));
  } catch {
    // Nothing to do if the browser will not store it.
  }
}

/** Store a cabinet's setup under a name so it can be added again in one click. */
function addPreset(name, cab) {
  try {
    const preset = validateCabinet({ id: uid(), name, type: cab.type, config: cab.config, width: cab.width, overrides: { ...cab.overrides } }, true);
    const next = [...presets, preset];
    localStorage.setItem(PRESET_KEY, JSON.stringify(next));
    presets = next;
    renderPresets();
    jobMessage('Preset saved.');
  } catch { jobMessage('Could not save preset. Check its dimensions/options and browser storage. Existing presets are unchanged.'); }
}

function renderPresets() {
  const host = $('#preset-list');
  const empty = $('#preset-empty');
  host.replaceChildren();

  empty.hidden = presets.length > 0;
  $('#preset-count').textContent = presets.length
    ? `${presets.length} saved`
    : '';

  for (const preset of presets) {
    const chip = el('div', 'preset');

    const use = el('button', 'preset-use');
    use.type = 'button';
    use.append(el('span', 'preset-name', preset.name));
    use.append(el('span', 'preset-sub',
      `${family(preset.type)?.short ?? preset.type} ${preset.width}`));
    use.title = `Add ${preset.name}`;
    use.addEventListener('click', () => {
      state.cabinets.push({
        id: uid(),
        type: preset.type,
        config: preset.config,
        width: preset.width,
        qty: 1,
        label: preset.name,
        overrides: { ...preset.overrides },
      });
      saveDraft();
      renderCabinets();
      renderOutput();
    });

    const remove = el('button', 'ghost danger preset-remove', '×');
    remove.type = 'button';
    remove.title = `Forget the ${preset.name} preset`;
    remove.addEventListener('click', () => {
      if (!confirm(`Forget the preset "${preset.name}"?`)) return;
      presets = presets.filter((x) => x.id !== preset.id);
      savePresets();
      renderPresets();
    });

    chip.append(use, remove);
    host.append(chip);
  }
}

/* ------------------------------------------------------------------ *
 * Display settings
 *
 * The theme and text size are the operator's own preference and are stored
 * separately from the job, so they survive clearing a kitchen.
 * ------------------------------------------------------------------ */

const display = { theme: 'auto', size: 'normal' };

function applyDisplay() {
  const root = document.documentElement;
  if (display.theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', display.theme);
  root.setAttribute('data-size', display.size);

  for (const b of document.querySelectorAll('#theme-toggle button')) {
    b.classList.toggle('on', b.dataset.theme === display.theme);
  }
  for (const b of document.querySelectorAll('#size-toggle button')) {
    b.classList.toggle('on', b.dataset.size === display.size);
  }

  try {
    localStorage.setItem(DISPLAY_KEY, JSON.stringify(display));
  } catch {
    // A stored preference is a convenience, not a requirement.
  }
}

function loadDisplay() {
  try {
    const raw = localStorage.getItem(DISPLAY_KEY);
    if (raw) Object.assign(display, JSON.parse(raw));
  } catch {
    // Keep the defaults.
  }
}

function wireDisplay() {
  $('#theme-toggle').addEventListener('click', (e) => {
    const button = e.target.closest('button[data-theme]');
    if (!button) return;
    display.theme = button.dataset.theme;
    applyDisplay();
  });

  $('#size-toggle').addEventListener('click', (e) => {
    const button = e.target.closest('button[data-size]');
    if (!button) return;
    display.size = button.dataset.size;
    applyDisplay();
  });
}

/* ------------------------------------------------------------------ *
 * Export
 * ------------------------------------------------------------------ */

function wireExport() {
  $('#export-csv').addEventListener('click', () => {
    const { consolidated } = compute();
    if (consolidated.length === 0) {
      alert('Add some cabinets first - there is nothing to cut yet.');
      return;
    }
    const rows = cutlistRows(state.job, consolidated, {
      thickness: state.globals.boardThickness,
    });
    downloadCsv(cutlistFilename(state.job), toCsv(rows));
  });
}

/* ------------------------------------------------------------------ *
 * Calculation
 * ------------------------------------------------------------------ */

/** Expand every cabinet, keeping each one's parts and warnings together. */
function compute() {
  const globals = { ...state.globals, gola: state.job.gola };
  const groups = [];

  for (const cab of state.cabinets) {
    try {
      const { parts, warnings } = expandCabinet(cab, globals);
      groups.push({ cab, parts, warnings });
    } catch (err) {
      groups.push({ cab, parts: [], warnings: [err.message] });
    }
  }

  const all = groups.flatMap((g) => g.parts);
  return { groups, all, consolidated: consolidate(all) };
}

/* ------------------------------------------------------------------ *
 * Job fields
 * ------------------------------------------------------------------ */

function wireJobFields() {
  const bind = (sel, key) => {
    const input = $(sel);
    input.value = state.job[key] ?? '';
    input.addEventListener('input', () => {
      state.job[key] = input.value;
      saveDraft();
      renderOutput();
    });
  };

  bind('#j-client', 'client');
  bind('#j-ref', 'reference');
  bind('#j-board', 'boardColour');
  bind('#j-edge', 'edgeColour');

  const gola = $('#j-gola');
  gola.checked = state.job.gola;
  gola.addEventListener('change', () => {
    state.job.gola = gola.checked;
    saveDraft();
    refreshAllCards();
    renderOutput();
  });
}

/* ------------------------------------------------------------------ *
 * Kickplate calculator
 * ------------------------------------------------------------------ */

const mm = (value) => `${new Intl.NumberFormat('en-GB', {
  maximumFractionDigits: 2,
}).format(value)} mm`;

function renderKickplateSummary() {
  const result = calculateKickplateRequirement(
    state.cabinets,
    state.kickplate,
    state.globals,
  );

  // A combined corner measurement belongs to the floor layout it was entered
  // for. Any floor-line change can alter a measured corner or an explicit-zero
  // adjoining-run decision, so require confirmation again before ordering.
  if (result.cornerMeasurementStale) {
    state.kickplate.cornerAllowance = null;
    state.kickplate.cornerSignature = null;
    $('#k-corner-allowance').value = '';
    saveDraft();
  }

  const depth = $('#k-end-depth');
  depth.placeholder = String(state.globals.floorDepth);
  $('#k-corner-field').hidden = result.cornerUnits === 0;

  $('#k-fronts').textContent = mm(result.frontLength);
  $('#k-ends').textContent = mm(result.endLength);
  $('#k-corners').textContent = mm(result.cornerLength);
  $('#k-total').textContent = mm(result.requiredLength);

  const buy = $('#k-buy');
  const spare = $('#k-spare');
  const status = $('#k-status');

  if (!result.complete) {
    buy.textContent = 'Resolve the inputs above to calculate stock';
    spare.textContent = '';
    status.textContent = 'needs attention';
  } else if (result.requiredLength === 0) {
    buy.textContent = 'Add floor cupboards to calculate';
    spare.textContent = '';
    status.textContent = '';
  } else {
    const noun = result.lengthsRequired === 1 ? 'length' : 'lengths';
    buy.textContent =
      `${result.lengthsRequired} x ${result.stockLength} mm ` +
      `${result.materialLabel.toLowerCase()} ${noun}`;
    spare.textContent =
      `${mm(result.spareLength)} spare before cuts; ${mm(result.kickHeight)} high`;
    status.textContent = `${(result.requiredLength / 1000).toFixed(2)} m needed`;
  }

  const warnings = $('#k-warnings');
  warnings.replaceChildren();
  warnings.hidden = result.warnings.length === 0;
  for (const warning of result.warnings) warnings.append(el('p', null, warning));
}

function wireKickplateCalculator() {
  const material = $('#k-material');
  material.replaceChildren();
  for (const [value, spec] of Object.entries(KICKPLATE_MATERIALS)) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = `${spec.label} - ${spec.stockLength} mm`;
    material.append(option);
  }
  if (!Object.prototype.hasOwnProperty.call(
    KICKPLATE_MATERIALS,
    state.kickplate.material,
  )) {
    state.kickplate.material = DEFAULT_KICKPLATE_SETTINGS.material;
  }
  material.value = state.kickplate.material;
  material.addEventListener('change', () => {
    state.kickplate.material = material.value;
    saveDraft();
    renderKickplateSummary();
  });

  const endCount = $('#k-end-count');
  const endDepth = $('#k-end-depth');
  const cornerAllowance = $('#k-corner-allowance');
  endCount.value = state.kickplate.endCount ?? 0;
  endDepth.value = state.kickplate.endDepth ?? '';
  cornerAllowance.value = state.kickplate.cornerAllowance ?? '';

  const bindNumber = (input, key, blankValue) => {
    input.addEventListener('input', () => {
      const raw = input.value.trim();
      state.kickplate[key] = raw === '' ? blankValue : Number(raw);
      if (key === 'cornerAllowance') {
        const current = calculateKickplateRequirement(
          state.cabinets,
          state.kickplate,
          state.globals,
        );
        state.kickplate.cornerSignature = raw === '' ? null : current.cornerSignature;
      }
      saveDraft();
      renderKickplateSummary();
    });
  };
  bindNumber(endCount, 'endCount', 0);
  bindNumber(endDepth, 'endDepth', null);
  bindNumber(cornerAllowance, 'cornerAllowance', null);

  renderKickplateSummary();
}

function renderGlobals() {
  const host = $('#globals');
  host.replaceChildren();

  for (const g of GLOBAL_FIELDS) {
    const input = numberInput(state.globals[g.id], { min: 1, max: 4000 });
    input.addEventListener('input', () => {
      const v = Number(input.value);
      if (Number.isFinite(v) && v > 0) {
        state.globals[g.id] = v;
        saveDraft();
        refreshAllCards();
        renderOutput();
      }
    });
    host.append(field(g.label, input));
  }

}

function wireGlobalsReset() {
  $('#reset-globals').addEventListener('click', () => {
    state.globals = { ...DEFAULT_GLOBALS };
    renderGlobals();
    refreshAllCards();
    renderOutput();
    saveDraft();
  });
}

/* ------------------------------------------------------------------ *
 * Add-cabinet form
 * ------------------------------------------------------------------ */

function renderAddForm() {
  const famSelect = $('#a-family');
  const cfgSelect = $('#a-config');
  const widthInput = $('#a-width');
  const qtyInput = $('#a-qty');
  const chips = $('#a-widths');

  famSelect.replaceChildren();
  for (const f of FAMILIES) {
    const o = document.createElement('option');
    o.value = f.id;
    o.textContent = f.label;
    famSelect.append(o);
  }
  // Set the selection explicitly rather than relying on a select adopting its
  // first option, which is easy to break and hard to notice.
  famSelect.value = FAMILIES[0].id;

  function syncConfigs() {
    const fam = family(famSelect.value) ?? FAMILIES[0];
    cfgSelect.replaceChildren();
    for (const c of fam.configs) {
      const o = document.createElement('option');
      o.value = c.id;
      o.textContent = c.label;
      cfgSelect.append(o);
    }
    cfgSelect.value = fam.configs[0].id;
    widthInput.value = defaultWidthFor(fam.id, cfgSelect.value);
    syncChips();
  }

  function syncChips() {
    chips.replaceChildren();
    for (const w of widthsFor(famSelect.value, cfgSelect.value)) {
      const b = el('button', null, String(w));
      b.type = 'button';
      if (Number(widthInput.value) === w) b.classList.add('on');
      b.addEventListener('click', () => {
        widthInput.value = w;
        syncChips();
        widthInput.focus();
      });
      chips.append(b);
    }
  }

  famSelect.addEventListener('change', syncConfigs);
  cfgSelect.addEventListener('change', () => {
    // A shape with a higher minimum - a corner, an oven housing - may not be
    // able to use the width that was showing.
    const allowed = widthsFor(famSelect.value, cfgSelect.value);
    const min = config(famSelect.value, cfgSelect.value)?.minWidth ?? 0;
    if (Number(widthInput.value) < min) {
      widthInput.value = allowed[0] ?? defaultWidthFor(famSelect.value, cfgSelect.value);
    }
    syncChips();
  });
  widthInput.addEventListener('input', syncChips);

  function add() {
    const width = Number(widthInput.value);
    const qty = Number(qtyInput.value);
    if (!Number.isFinite(width) || width <= 0) {
      widthInput.focus();
      return;
    }

    const cab = makeCabinet(famSelect.value, cfgSelect.value, width);
    cab.id = uid();
    cab.qty = Number.isFinite(qty) && qty > 0 ? qty : 1;
    state.cabinets.push(cab);

    saveDraft();
    renderCabinets();
    renderOutput();
    widthInput.focus();
    widthInput.select();
  }

  $('#a-add').addEventListener('click', add);
  for (const input of [widthInput, qtyInput]) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); add(); }
    });
  }

  syncConfigs();
}

/* ------------------------------------------------------------------ *
 * Cabinet cards
 * ------------------------------------------------------------------ */

/** Cards by cabinet id, so they can be refreshed without rebuilding. */
const cards = new Map();

/**
 * Summarise what a cabinet actually is, in the words the workshop uses.
 *
 * Shelf and drawer counts are read back from the panels the engine produced
 * rather than from the settings, so the card always states what will really be
 * cut - which is the confirmation that an option took effect.
 */
function describeOptions(cab, parts) {
  const o = cab.overrides || {};
  const bits = [];

  const count = (match) => parts
    .filter((p) => match.test(p.desc))
    .reduce((n, p) => n + p.qty, 0) / Math.max(cab.qty || 1, 1);

  if (o.doors) bits.push(`${o.doors} ${o.doors === 1 ? 'door' : 'doors'}`);

  if (cab.config === 'drawers') {
    const drawers = o.drawers ?? 4;
    bits.push(`${drawers} drawers`);
    bits.push(`${o.runnerDepth ?? 500} runner`);
  }

  if (cab.config === 'elo') {
    const label = { single: 'single oven', double: 'double oven', compact: 'compact' };
    bits.push(label[o.aperture ?? 'single'] ?? `${o.aperture} mm opening`);
  }

  const fixed = count(/^fixed shelf$/);
  if (fixed) bits.push(`${fixed} fixed`);

  const shelves = count(/shelf|shelves/) - fixed;
  if (shelves > 0) bits.push(`${shelves} ${shelves === 1 ? 'shelf' : 'shelves'}`);
  else if (cab.config !== 'corner') bits.push('no shelf');

  if (o.legWidth) bits.push(`${o.legWidth} return`);
  if (o.height) bits.push(`${o.height} high`);
  if (o.depth) bits.push(`${o.depth} deep`);

  return bits;
}

function cabinetTitle(cab, parts = []) {
  const fam = family(cab.type);
  const cfg = fam?.configs.find((c) => c.id === cab.config);
  const name = `${fam?.short ?? cab.type} ${cab.width}`;
  const detail = [cfg?.label ?? cab.config, ...describeOptions(cab, parts)].join(' · ');

  return {
    main: cab.label || name,
    sub: cab.label ? `${name} · ${detail}` : detail,
  };
}

function buildCard(cab) {
  const card = el('div', 'cab');
  card.dataset.id = cab.id;

  /* ---- top row ---- */
  const top = el('div', 'cab-top');

  const name = el('div', 'cab-name');
  const nameMain = el('span');
  const nameSub = el('span', 'sub');
  name.append(nameMain, ' ', nameSub);

  const qtyWrap = el('div', 'cab-qty');
  const qty = numberInput(cab.qty, { min: 1, max: 99 });
  const qtyLabel = el('span', null, 'qty');
  qtyWrap.append(qtyLabel, qty);
  qty.addEventListener('input', () => {
    const v = Number(qty.value);
    cab.qty = Number.isFinite(v) && v > 0 ? v : 1;
    saveDraft();
    renderOutput();
  });

  const toggle = el('button', 'ghost', 'Options');
  toggle.type = 'button';

  const remove = el('button', 'ghost danger', '×');
  remove.type = 'button';
  remove.title = 'Remove this cabinet';
  remove.addEventListener('click', () => {
    state.cabinets = state.cabinets.filter((c) => c.id !== cab.id);
    cards.delete(cab.id);
    openCards.delete(cab.id);
    saveDraft();
    renderCabinets();
    renderOutput();
  });

  top.append(name, qtyWrap, toggle, remove);

  /* ---- body ---- */
  const body = el('div', 'cab-body');
  body.hidden = !openCards.has(cab.id);

  toggle.addEventListener('click', () => {
    body.hidden = !body.hidden;
    if (body.hidden) openCards.delete(cab.id); else openCards.add(cab.id);
  });

  const warn = el('div', 'cab-warn');
  warn.hidden = true;

  card.append(top, body, warn);
  buildCardBody(cab, body);

  const refresh = () => {
    if (Number(qty.value) !== cab.qty) qty.value = cab.qty;

    const globals = { ...state.globals, gola: state.job.gola };
    let warnings = [];
    let parts = [];
    try {
      ({ parts, warnings } = expandCabinet(cab, globals));
    } catch (err) {
      warnings = [err.message];
    }

    const t = cabinetTitle(cab, parts);
    nameMain.textContent = t.main;
    nameSub.textContent = t.sub;
    warn.replaceChildren();
    warn.hidden = warnings.length === 0;
    card.classList.toggle('has-warning', warnings.length > 0);
    for (const w of warnings) warn.append(el('p', null, w));
  };

  cards.set(cab.id, { card, refresh });
  refresh();
  return card;
}

/** The editable options inside a card. Rebuilt when the shape changes. */
function buildCardBody(cab, body) {
  body.replaceChildren();

  const fam = family(cab.type);

  /* label */
  const label = document.createElement('input');
  label.type = 'text';
  label.placeholder = 'e.g. left of the window';
  label.value = cab.label ?? '';
  label.addEventListener('input', () => {
    cab.label = label.value;
    saveDraft();
    cards.get(cab.id)?.refresh();
    renderOutput();
  });

  /* shape */
  const shape = selectInput(
    fam.configs.map((c) => ({ value: c.id, label: c.label })),
    cab.config,
  );
  shape.addEventListener('change', () => {
    const min = config(cab.type, shape.value)?.minWidth ?? 0;
    if (cab.width < min) cab.width = defaultWidthFor(cab.type, shape.value);
    const fresh = makeCabinet(cab.type, shape.value, cab.width);
    cab.config = shape.value;
    cab.overrides = fresh.overrides;
    saveDraft();
    buildCardBody(cab, body);
    cards.get(cab.id)?.refresh();
    renderOutput();
  });

  /* width */
  const width = numberInput(cab.width, { min: 50, max: 3000 });
  const chips = el('div', 'widths');

  const syncChips = () => {
    chips.replaceChildren();
    for (const w of widthsFor(cab.type, cab.config)) {
      const b = el('button', null, String(w));
      b.type = 'button';
      if (cab.width === w) b.classList.add('on');
      b.addEventListener('click', () => {
        cab.width = w;
        width.value = w;
        syncChips();
        saveDraft();
        cards.get(cab.id)?.refresh();
        renderOutput();
      });
      chips.append(b);
    }
  };

  width.addEventListener('input', () => {
    const v = Number(width.value);
    if (Number.isFinite(v) && v > 0) {
      cab.width = v;
      syncChips();
      saveDraft();
      cards.get(cab.id)?.refresh();
      renderOutput();
    }
  });
  syncChips();

  /* Height and depth. Blank means "use the standard for this family", and the
     placeholder shows what that standard is, so the box is never a mystery. */
  const globals = { ...state.globals, gola: state.job.gola };
  const standard = resolve({ ...cab, overrides: {} }, globals);

  const sizeInputs = SIZE_FIELDS.map((f) => {
    const input = numberInput(cab.overrides[f.id], {
      min: 1,
      max: 4000,
      placeholder: String(f.id === 'height' ? standard.H : standard.D),
    });
    input.addEventListener('input', () => {
      const raw = input.value.trim();
      if (raw === '') {
        delete cab.overrides[f.id];
      } else {
        const v = Number(raw);
        if (!Number.isFinite(v) || v <= 0) return;
        cab.overrides[f.id] = v;
      }
      saveDraft();
      cards.get(cab.id)?.refresh();
      renderOutput();
    });
    return field(f.label, input);
  });

  const row1 = el('div', 'grid grid-2');
  row1.append(field('Shape', shape), field('Width', width));

  const sizeRow = el('div', 'grid grid-2');
  sizeRow.append(...sizeInputs);

  const row2 = el('div', 'grid');
  row2.append(field('Label', label, 'Optional. Shows on the cutting list.'));

  const sizeHint = el('div', 'hint',
    'Height and depth are blank unless you change them - the standard for this '
    + 'family is shown in grey. Every panel re-cuts as you type.');

  /* Save this setup to reuse on the next kitchen. */
  const savePreset = el('button', null, 'Save as preset');
  savePreset.type = 'button';
  savePreset.style.marginTop = '12px';
  savePreset.addEventListener('click', () => {
    const suggested = cab.label
      || `${family(cab.type)?.short ?? cab.type} ${cab.width} ${config(cab.type, cab.config)?.label ?? ''}`.trim();
    const name = prompt('Name this preset', suggested);
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    addPreset(trimmed, cab);
  });

  body.append(row1, chips, sizeRow, sizeHint, row2);
  body.append(savePreset);

  /* configuration-specific options */
  const fields = fieldsFor(cab.type, cab.config);
  if (fields.length) {
    const optRow = el('div', 'grid grid-2');
    optRow.style.marginTop = '10px';

    for (const f of fields) {
      let control;
      if (f.type === 'choice') {
        control = selectInput(f.options, cab.overrides[f.id] ?? f.default);
        control.addEventListener('change', () => {
          const raw = control.value;
          const num = Number(raw);
          cab.overrides[f.id] = Number.isFinite(num) && raw.trim() !== '' ? num : raw;
          saveDraft();
          cards.get(cab.id)?.refresh();
          renderOutput();
        });
      } else {
        control = numberInput(cab.overrides[f.id], { min: 0, max: 3000, placeholder: 'standard' });
        control.addEventListener('input', () => {
          const raw = control.value.trim();
          cab.overrides[f.id] = raw === '' ? null : Number(raw);
          saveDraft();
          cards.get(cab.id)?.refresh();
          renderOutput();
        });
      }
      optRow.append(field(f.label, control, f.hint));
    }
    body.append(optRow);
  }
}

function renderCabinets() {
  const host = $('#cab-list');
  host.replaceChildren();

  if (state.cabinets.length === 0) {
    host.append(el('div', 'empty', 'No cabinets yet. Pick a type and width above, then press Add.'));
  } else {
    for (const cab of state.cabinets) {
      const existing = cards.get(cab.id);
      host.append(existing ? existing.card : buildCard(cab));
    }
  }

  const n = state.cabinets.length;
  const units = state.cabinets.reduce((sum, c) => sum + (c.qty || 0), 0);
  $('#cab-count').textContent = n === 0
    ? 'nothing added yet'
    : `${n} ${n === 1 ? 'line' : 'lines'} · ${units} ${units === 1 ? 'unit' : 'units'}`;
}

function refreshAllCards() {
  for (const { refresh } of cards.values()) refresh();
}

/* ------------------------------------------------------------------ *
 * Output
 * ------------------------------------------------------------------ */

function edgeCell(count, length) {
  const td = el('td', `edge-cell${count ? ' has' : ''}`);
  td.textContent = count ? `${count} × ${length}` : '–';
  return td;
}

function partsTable(rows, { showCabinet }) {
  const wrap = el('div', 'table-wrap');
  const table = document.createElement('table');

  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  const headers = [
    { text: 'Qty', cls: 'num' },
    { text: 'Length', cls: 'num' },
    { text: 'Width', cls: 'num' },
    { text: 'Part' },
    { text: 'Long edge' },
    { text: 'Short edge' },
  ];
  if (showCabinet) headers.push({ text: 'Cabinet' });
  for (const h of headers) {
    const th = el('th', h.cls, h.text);
    hr.append(th);
  }
  thead.append(hr);

  const tbody = document.createElement('tbody');
  for (const row of rows) {
    if (row.group) {
      const tr = el('tr', 'group-row');
      const td = document.createElement('td');
      td.colSpan = headers.length;

      const head = el('div', 'group-head');
      head.append(el('span', 'group-name', row.group));
      if (row.units > 1) head.append(el('span', 'group-units', `× ${row.units}`));
      if (row.detail) head.append(el('span', 'group-detail', row.detail));
      if (row.size) head.append(el('span', 'group-size', row.size));
      td.append(head);

      tr.append(td);
      tbody.append(tr);
      continue;
    }

    const p = row.part;
    const tr = document.createElement('tr');
    tr.append(el('td', 'num', String(p.qty)));
    tr.append(el('td', 'num dim', String(p.l)));
    tr.append(el('td', 'num dim', String(p.w)));
    tr.append(el('td', null, p.desc));
    tr.append(edgeCell(p.eL, p.l));
    tr.append(edgeCell(p.eS, p.w));
    if (showCabinet) {
      const cabinets = p.cabinets ? p.cabinets.join(', ') : p.cabinet;
      tr.append(el('td', 'muted', cabinets));
    }
    tbody.append(tr);
  }

  table.append(thead, tbody);
  wrap.append(table);
  return wrap;
}

function renderOutput() {
  const { groups, all, consolidated } = compute();
  renderKickplateSummary();

  /* ---- totals ---- */
  const panels = all.reduce((n, p) => n + p.qty, 0);
  $('#t-cabinets').textContent = String(state.cabinets.reduce((n, c) => n + (c.qty || 0), 0));
  // The line count lives next to the cutting list heading rather than in the
  // masthead, which is reserved for the figures used when ordering board.
  $('#t-panels').textContent = String(panels);
  $('#t-area').textContent = `${totalArea(all).toFixed(2)} m²`;
  $('#t-edging').textContent = `${totalEdging(all).toFixed(1)} m`;

  /* ---- warnings ---- */
  const alerts = $('#alerts');
  alerts.replaceChildren();
  const flagged = groups.filter((g) => g.warnings.length > 0);
  if (flagged.length) {
    const box = el('div', 'alerts');
    box.append(el('h3', null,
      `${flagged.length} ${flagged.length === 1 ? 'cabinet needs' : 'cabinets need'} attention`));
    const list = document.createElement('ul');
    for (const g of flagged) {
      for (const w of g.warnings) {
        list.append(el('li', null, `${describeCabinet(g.cab)} — ${w}`));
      }
    }
    box.append(list);
    alerts.append(box);
  }

  /* ---- table ---- */
  const host = $('#parts');
  host.replaceChildren();
  $('#parts-count').textContent = consolidated.length
    ? `${consolidated.length} lines · ${panels} panels`
    : '';

  if (all.length === 0) {
    host.append(el('div', 'empty',
      'The cutting list appears here as you add cabinets.'));
    return;
  }

  if (state.view === 'consolidated') {
    host.append(partsTable(
      consolidated.map((part) => ({ part })),
      { showCabinet: true },
    ));
    return;
  }

  /* ---- by cabinet: the sheet the workshop builds from ---- */
  const globals = { ...state.globals, gola: state.job.gola };
  const rows = [];

  for (const g of groups) {
    if (!g.parts.length) continue;

    // One unit's worth, so the list reads as "what this cupboard needs".
    let unitParts = g.parts;
    try {
      unitParts = expandCabinet({ ...g.cab, qty: 1 }, globals).parts;
    } catch {
      // Fall back to the multiplied parts rather than showing nothing.
    }

    const d = resolve(g.cab, globals);
    const fam = family(g.cab.type);
    const cfg = fam?.configs.find((c) => c.id === g.cab.config);
    const name = g.cab.label
      ? `${g.cab.label} — ${fam?.short ?? g.cab.type} ${g.cab.width}`
      : `${fam?.short ?? g.cab.type} ${g.cab.width}`;

    rows.push({
      group: name,
      units: g.cab.qty,
      detail: [cfg?.label ?? g.cab.config, ...describeOptions(g.cab, unitParts)].join(' · '),
      size: `${g.cab.width} w × ${d.H} h × ${d.D} d`,
    });
    for (const part of unitParts) rows.push({ part });
  }

  const note = el('p', 'view-note',
    'Quantities are for one unit. A cabinet added more than once shows × the number needed.');
  host.append(note, partsTable(rows, { showCabinet: false }));
}

/* ------------------------------------------------------------------ *
 * Start
 * ------------------------------------------------------------------ */

function wireViewToggle() {
  const toggle = $('#view-toggle');
  toggle.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-view]');
    if (!button) return;
    state.view = button.dataset.view;
    for (const b of toggle.querySelectorAll('button')) {
      b.classList.toggle('on', b.dataset.view === state.view);
    }
    saveDraft();
    renderOutput();
  });
}

function wireClearAll() {
  $('#clear-all').addEventListener('click', () => {
    if (state.cabinets.length === 0) return;
    const n = state.cabinets.length;
    if (!confirm(`Remove all ${n} ${n === 1 ? 'cabinet' : 'cabinets'} from this kitchen?`)) return;
    state.cabinets = [];
    cards.clear();
    openCards.clear();
    saveDraft();
    renderCabinets();
    renderOutput();
  });
}


const JOBS_KEY = 'mkitchens.cutlist.jobs';
let jobs = [];
let activeJob = null;
let jobsReadable = true;
const snapshot = () => JSON.parse(JSON.stringify(state));
const jobMessage = text => { $('#job-status').textContent = text; };
function persistJobs(next) {
  if (!jobsReadable) { jobMessage('Saved job data could not be read. Export the draft; existing saved data cannot be overwritten.'); return false; }
  try { localStorage.setItem(JOBS_KEY, JSON.stringify(next)); jobs = next; return true; }
  catch { jobMessage('Could not save jobs in this browser. Export a job backup to keep your work.'); return false; }
}
function renderJobs(selected = activeJob) {
  const host = $('#saved-jobs');
  host.replaceChildren();
  const blank = el('option', null, 'Choose a saved job'); blank.value = ''; host.append(blank);
  for (const job of jobs) { const option = el('option', null, job.name); option.value = job.id; host.append(option); }
  host.value = selected ?? '';
  const active = jobs.find(j => j.id === activeJob);
  $('#job-save').textContent = active ? 'Update saved job' : 'Save job';
  $('#job-save').title = active ? 'Update ' + active.name + ' from the working draft' : 'Save the working draft as a named job';
}
function applyJob(data, id = null) {
  clearTimeout(saveTimer);
  Object.assign(state, validateJob(data));
  activeJob = id;
  cards.clear(); openCards.clear();
  for (const [selector, key] of [['#j-client','client'],['#j-ref','reference'],['#j-board','boardColour'],['#j-edge','edgeColour']]) $(selector).value = state.job[key];
  $('#j-gola').checked = state.job.gola;
  for (const [selector, key] of [['#k-material','material'],['#k-end-count','endCount'],['#k-end-depth','endDepth'],['#k-corner-allowance','cornerAllowance']]) $(selector).value = state.kickplate[key] ?? '';
  renderGlobals(); renderCabinets(); renderOutput(); renderJobs();
  for (const b of document.querySelectorAll('#view-toggle button')) b.classList.toggle('on', b.dataset.view === state.view);
  saveDraft();
}
function downloadBackup(kind, data, name) {
  const url = URL.createObjectURL(new Blob([encodeFile(kind, data)], { type: 'application/json' }));
  const link = el('a'); link.href = url; link.download = name.replace(/[^a-z0-9_-]/gi, '_') + '.json';
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function wireJobs() {
  try {
    const saved = JSON.parse(localStorage.getItem(JOBS_KEY) || '[]');
    if (!Array.isArray(saved)) throw new Error();
    jobs = saved.map(j => { if (!j || typeof j.id !== 'string' || typeof j.name !== 'string') throw new Error(); return { ...j, data: validateJob(j.data) }; });
    if (new Set(jobs.map(j => j.id)).size !== jobs.length) throw new Error();
  } catch { jobsReadable = false; jobs = []; jobMessage('Saved jobs could not be read. Existing browser data has been left untouched. Export your draft; saving is disabled to protect existing data.'); }
  if (!jobs.some(j => j.id === activeJob)) activeJob = null;
  renderJobs();
  $('#job-save').addEventListener('click', () => {
    const existing = jobs.find(j => j.id === activeJob);
    const name = existing?.name ?? prompt('Name this job', state.job.reference || state.job.client || 'Kitchen');
    if (!name?.trim()) return;
    if (existing && !confirm('Replace the saved snapshot of "' + name + '" with this draft?')) return;
    let data;
    try { data = validateJob(snapshot()); }
    catch { jobMessage('Could not save: check cabinet quantities, options and kickplate inputs for invalid values. Existing saved jobs are unchanged.'); return; }
    const entry = { id: existing?.id ?? uid(), name: name.trim(), data };
    if (persistJobs([...jobs.filter(j => j.id !== entry.id), entry])) { activeJob = entry.id; saveDraft(); renderJobs(); jobMessage('Saved "' + entry.name + '". Later edits stay in the draft until you save again.'); }
  });
  $('#job-open').addEventListener('click', () => {
    const job = jobs.find(j => j.id === $('#saved-jobs').value); if (!job) return;
    if (!confirm('Open "' + job.name + '" and replace the working draft? Export or save the draft first if you need it.')) return;
    applyJob(job.data, job.id); jobMessage('Opened "' + job.name + '".');
  });
  $('#job-new').addEventListener('click', () => {
    if (!confirm('Start a new job and replace the working draft? Saved jobs and presets remain available.')) return;
    applyJob({ job: { client:'', reference:'', boardColour:'', edgeColour:'', gola:false }, globals:{...DEFAULT_GLOBALS}, kickplate:{...DEFAULT_KICKPLATE_SETTINGS}, cabinets:[], view:'by-cabinet' });
    jobMessage('New job. Draft autosaves; save a named job to keep a snapshot.');
  });
  for (const action of ['rename','duplicate','delete']) $('#job-' + action).addEventListener('click', () => {
    const job = jobs.find(j => j.id === $('#saved-jobs').value); if (!job) return;
    if (action === 'delete') {
      if (!confirm('Delete saved job "' + job.name + '"? The working draft will remain.')) return;
      if (persistJobs(jobs.filter(j => j.id !== job.id))) { if (activeJob === job.id) activeJob = null; saveDraft(); renderJobs(); jobMessage('Saved job deleted.'); }
      return;
    }
    const name = prompt(action === 'rename' ? 'Rename saved job' : 'Name the duplicate', job.name + (action === 'duplicate' ? ' copy' : ''));
    if (!name?.trim()) return;
    const entry = {...job, id: action === 'duplicate' ? uid() : job.id, name: name.trim()};
    if (persistJobs(action === 'duplicate' ? [...jobs, entry] : jobs.map(j => j.id === job.id ? entry : j))) { renderJobs(entry.id); jobMessage('Saved job ' + (action === 'duplicate' ? 'duplicated.' : 'renamed.')); }
  });
  $('#job-export').addEventListener('click', () => {
    try { downloadBackup('job', validateJob(snapshot()), 'MKitchens_Job_' + (state.job.reference || state.job.client || 'Draft')); }
    catch { jobMessage('Could not export: check cabinet quantities, options and kickplate inputs for invalid values.'); }
  });
  $('#presets-export').addEventListener('click', () => {
    try { downloadBackup('presets', presets.map(p => validateCabinet(p, true)), 'MKitchens_Presets'); }
    catch { jobMessage('Could not export presets: the library contains invalid values. Correct or remove the affected presets first.'); }
  });
  for (const kind of ['job','presets']) {
    const input = $('#' + kind + '-file');
    $('#' + kind + '-import').addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files?.[0]; if (!file) return;
      try {
        if (file.size > 5 * 1024 * 1024) throw new Error('File is too large (maximum 5 MB).');
        const data = decodeFile(await file.text(), kind);
        if (kind === 'job') {
          if (!confirm('Import this job and replace the working draft? Saved jobs will remain.')) return;
          applyJob(data); jobMessage('Job imported into the draft. Save it as a named job when ready.');
        } else {
          const next = [...presets, ...data.map(p => ({...p, id:uid()}))];
          localStorage.setItem(PRESET_KEY, JSON.stringify(next)); presets = next; renderPresets(); jobMessage('Imported ' + data.length + ' presets; existing presets kept.');
        }
      } catch (error) { jobMessage('Import failed: ' + error.message); }
      finally { input.value = ''; }
    });
  }
}

loadDraft();
loadPresets();
loadDisplay();
applyDisplay();
wireDisplay();
wireExport();
wireJobFields();
renderGlobals();
wireGlobalsReset();
renderAddForm();
wireKickplateCalculator();
wireViewToggle();
wireClearAll();
wireJobs();
renderPresets();
renderCabinets();
renderOutput();

for (const b of document.querySelectorAll('#view-toggle button')) {
  b.classList.toggle('on', b.dataset.view === state.view);
}
