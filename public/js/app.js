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

import { expandCabinet, consolidate, totalArea, totalEdging, describeCabinet } from './rules.js';
import { DEFAULT_GLOBALS } from './constants.js';
import {
  FAMILIES, family, config, fieldsFor, makeCabinet, widthsFor, defaultWidthFor, GLOBAL_FIELDS,
} from './catalog.js';

const DRAFT_KEY = 'mkitchens.cutlist.draft';

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

const state = {
  job: { client: '', reference: '', boardColour: '', edgeColour: '', gola: false },
  globals: { ...DEFAULT_GLOBALS },
  cabinets: [],
  view: 'consolidated',
};

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
  return select;
}

/* ------------------------------------------------------------------ *
 * Saving the working draft
 *
 * Named jobs, import and export come later. This only makes sure a
 * half-entered kitchen survives an accidental refresh.
 * ------------------------------------------------------------------ */

let saveTimer = null;

function saveDraft() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const { job, globals, cabinets, view } = state;
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ job, globals, cabinets, view }));
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
    if (saved.job) Object.assign(state.job, saved.job);
    if (saved.globals) Object.assign(state.globals, saved.globals);
    if (Array.isArray(saved.cabinets)) state.cabinets = saved.cabinets;
    if (saved.view) state.view = saved.view;
  } catch {
    // A corrupt draft should never stop the app loading.
  }
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

function cabinetTitle(cab) {
  const fam = family(cab.type);
  const cfg = fam?.configs.find((c) => c.id === cab.config);
  return {
    main: cab.label || `${fam?.short ?? cab.type} ${cab.width}`,
    sub: cab.label ? `${fam?.short ?? cab.type} ${cab.width} · ${cfg?.label ?? cab.config}` : (cfg?.label ?? cab.config),
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
    const t = cabinetTitle(cab);
    nameMain.textContent = t.main;
    nameSub.textContent = t.sub;
    if (Number(qty.value) !== cab.qty) qty.value = cab.qty;

    const globals = { ...state.globals, gola: state.job.gola };
    let warnings = [];
    try {
      warnings = expandCabinet(cab, globals).warnings;
    } catch (err) {
      warnings = [err.message];
    }
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

  const row1 = el('div', 'grid grid-2');
  row1.append(field('Shape', shape), field('Width', width));

  const row2 = el('div', 'grid');
  row2.append(field('Label', label, 'Optional. Shows on the cutting list.'));

  body.append(row1, chips, row2);

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
      const td = el('td', null, row.group);
      td.colSpan = headers.length;
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

  /* ---- totals ---- */
  const panels = all.reduce((n, p) => n + p.qty, 0);
  $('#t-cabinets').textContent = String(state.cabinets.reduce((n, c) => n + (c.qty || 0), 0));
  $('#t-lines').textContent = String(consolidated.length);
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
  } else {
    const rows = [];
    for (const g of groups) {
      if (!g.parts.length) continue;
      const qty = g.cab.qty > 1 ? ` × ${g.cab.qty}` : '';
      rows.push({ group: `${describeCabinet(g.cab)}${qty}` });
      for (const part of g.parts) rows.push({ part });
    }
    host.append(partsTable(rows, { showCabinet: false }));
  }
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

loadDraft();
wireJobFields();
renderGlobals();
renderAddForm();
wireViewToggle();
wireClearAll();
renderCabinets();
renderOutput();

for (const b of document.querySelectorAll('#view-toggle button')) {
  b.classList.toggle('on', b.dataset.view === state.view);
}
