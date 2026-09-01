/**
 * Headless smoke test for the interface.
 *
 * A minimal DOM shim - just enough of the API that app.js uses - so the module
 * can be imported and driven in Node. Catches load-time errors that would
 * otherwise show up as a blank page in the browser, which is the single most
 * damaging way this app can break.
 *
 * The shim is deliberately shallow: it models elements, listeners, classes and
 * localStorage, and nothing else. It is not a browser. If it ever starts
 * failing for reasons that have nothing to do with the app, delete it - the
 * engine tests in public/tests are the ones that matter.
 *
 *     node tools/smoke-test.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ---------------- tiny DOM ---------------- */

class ClassList {
  constructor(node) { this.node = node; this.set = new Set(); }
  add(...c) { c.forEach((x) => this.set.add(x)); this.sync(); }
  remove(...c) { c.forEach((x) => this.set.delete(x)); this.sync(); }
  contains(c) { return this.set.has(c); }
  toggle(c, force) {
    const on = force === undefined ? !this.set.has(c) : force;
    if (on) this.set.add(c); else this.set.delete(c);
    this.sync();
  }
  sync() { this.node._className = [...this.set].join(' '); }
}

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attrs = {};
    this.dataset = {};
    this.style = {};
    this.listeners = {};
    this._className = '';
    this._text = '';
    this.value = '';
    this.hidden = false;
    this.checked = false;
    this.classList = new ClassList(this);
  }

  get className() { return this._className; }
  set className(v) {
    this._className = v || '';
    this.classList.set = new Set((v || '').split(/\s+/).filter(Boolean));
  }

  get textContent() {
    if (this.children.length) return this.children.map((c) => c.textContent ?? String(c)).join('');
    return this._text;
  }
  set textContent(v) { this._text = String(v); this.children = []; }

  get innerHTML() { return this._html ?? ''; }
  set innerHTML(v) { this._html = String(v); }

  append(...nodes) {
    for (const n of nodes) {
      if (n instanceof El) { n.parentNode = this; this.children.push(n); }
      else this.children.push({ textContent: String(n) });
    }
  }
  appendChild(n) { this.append(n); return n; }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
    this.parentNode = null;
  }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k]; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener() {}
  focus() {}
  select() {}
  closest(sel) {
    const want = sel.replace(/^\[|\]$/g, '');
    let n = this;
    while (n) {
      if (want.startsWith('button') && n.tagName === 'BUTTON') return n;
      if (want.includes('data-view') && n.dataset?.view) return n;
      n = n.parentNode;
    }
    return null;
  }

  /** Fire a listener, as the browser would. */
  fire(type, event = {}) {
    for (const fn of this.listeners[type] || []) fn({ target: this, preventDefault() {}, ...event });
  }

  descendants() {
    const out = [];
    const walk = (n) => {
      for (const c of n.children) {
        if (c instanceof El) { out.push(c); walk(c); }
      }
    };
    walk(this);
    return out;
  }

  querySelectorAll(sel) {
    const all = this.descendants();
    if (sel === 'button') return all.filter((n) => n.tagName === 'BUTTON');
    if (sel.includes('button')) return all.filter((n) => n.tagName === 'BUTTON');
    return all;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
}

const byId = new Map();

const documentElement = new El('html');
const bodyEl = new El('body');

const document = {
  documentElement,
  body: bodyEl,
  createElement: (tag) => new El(tag),
  querySelector(sel) {
    if (sel.startsWith('#')) {
      const id = sel.slice(1).split(' ')[0];
      return byId.get(id) ?? null;
    }
    return null;
  },
  querySelectorAll(sel) {
    if (sel.startsWith('#')) {
      const [idPart] = sel.split(' ');
      const root = byId.get(idPart.slice(1));
      return root ? root.querySelectorAll('button') : [];
    }
    return [];
  },
};

/* Build the elements index.html declares, from the file itself. */
const html = readFileSync(join(ROOT, 'public', 'index.html'), 'utf8');

/** The substring an element occupies, found by counting its own tag. */
function innerHtmlOf(source, tag, openIndex) {
  const open = new RegExp(`<${tag}\\b`, 'g');
  const close = new RegExp(`</${tag}>`, 'g');
  const start = source.indexOf('>', openIndex) + 1;

  let depth = 1;
  let cursor = start;
  while (depth > 0 && cursor < source.length) {
    open.lastIndex = cursor;
    close.lastIndex = cursor;
    const nextOpen = open.exec(source);
    const nextClose = close.exec(source);
    if (!nextClose) break;
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      cursor = nextOpen.index + 1;
    } else {
      depth--;
      cursor = nextClose.index + 1;
      if (depth === 0) return source.slice(start, nextClose.index);
    }
  }
  return source.slice(start, cursor);
}

for (const m of html.matchAll(/<(\w+)[^>]*\bid="([A-Za-z0-9_-]+)"/g)) {
  const node = new El(m[1]);
  node.id = m[2];
  byId.set(m[2], node);

  // Buttons declared in the markup - the view, theme and size toggles - need
  // to exist as children, since the app finds them by querying the container.
  const inner = innerHtmlOf(html, m[1], m.index);
  for (const b of inner.matchAll(/<button\b([^>]*)>/g)) {
    const button = new El('button');
    for (const attr of b[1].matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) {
      const [, name, value] = attr;
      if (name.startsWith('data-')) {
        const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        button.dataset[key] = value;
      } else if (name === 'class') {
        button.className = value;
      }
    }
    node.append(button);
  }
}

const store = new Map();
globalThis.document = document;
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, v),
  removeItem: (k) => store.delete(k),
};
globalThis.confirm = () => true;
globalThis.alert = () => {};
globalThis.prompt = (_msg, suggested) => suggested ?? 'Preset';
globalThis.Blob = class { constructor(parts) { this.parts = parts; } };
globalThis.URL = { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} };
globalThis.HTMLElement = El;

/* ---------------- drive it ---------------- */

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${ok ? '' : `  <- ${extra}`}`);
  if (!ok) failures++;
};

console.log('\nInterface smoke test\n--------------------');

try {
  await import('../public/js/app.js');
  check('app.js loads without throwing', true);
} catch (err) {
  check('app.js loads without throwing', false, err.stack?.split('\n').slice(0, 3).join(' | '));
  process.exit(1);
}

const famSelect = byId.get('a-family');
const cfgSelect = byId.get('a-config');
const widthInput = byId.get('a-width');
const addButton = byId.get('a-add');
const cabList = byId.get('cab-list');
const parts = byId.get('parts');

check('type dropdown was populated', famSelect.children.length === 5,
  `${famSelect.children.length} options`);
check('shape dropdown was populated', cfgSelect.children.length > 0,
  `${cfgSelect.children.length} options`);
check('width defaulted', Number(widthInput.value) > 0, `value="${widthInput.value}"`);
check('standard-width chips rendered', byId.get('a-widths').children.length > 0);
check('job dimension fields rendered', byId.get('globals').children.length === 11,
  `${byId.get('globals').children.length} fields`);
check('kickplate material choices rendered', byId.get('k-material').children.length === 2,
  `${byId.get('k-material').children.length} choices`);
{
  const globalInput = (label) => byId.get('globals').children
    .find((item) => item.children.some(
      (child) => child.tagName === 'LABEL' && child.textContent === label,
    ))
    ?.children.find((child) => child.tagName === 'INPUT');
  check('fresh floor defaults are independently 720 and 150',
    Number(globalInput('Floor height')?.value) === 720
      && Number(globalInput('Kickplate height')?.value) === 150,
    `floor ${globalInput('Floor height')?.value}, kick ${globalInput('Kickplate height')?.value}`);
}
check('cabinet list starts empty', cabList.children.length === 1
  && cabList.children[0].className === 'empty');

/* add a cabinet */
famSelect.value = 'floor';
famSelect.fire('change');
cfgSelect.value = 'doors';
cfgSelect.fire('change');
widthInput.value = '600';
addButton.fire('click');

check('adding a cabinet created a card', cabList.children.length === 1
  && cabList.children[0].className.includes('cab'), cabList.children[0]?.className);
check('cutting list rendered rows', parts.descendants().some((n) => n.tagName === 'TD'));
check('panel total updated', Number(byId.get('t-panels').textContent) > 0,
  byId.get('t-panels').textContent);
check('board area updated', byId.get('t-area').textContent !== '0.00 m²',
  byId.get('t-area').textContent);
check('kickplate calculator counts the first straight floor front',
  byId.get('k-fronts').textContent.replace(/,/g, '') === '600 mm',
  byId.get('k-fronts').textContent);
await new Promise((r) => setTimeout(r, 400)); // the draft save is debounced
check('draft was saved', store.size > 0);

/* a second cabinet of the same kind should consolidate */
const linesAfterOne = byId.get('parts-count').textContent;
addButton.fire('click');
const linesAfterTwo = byId.get('parts-count').textContent;
const lineCount = (t) => Number(String(t).match(/^(\d+)/)?.[1] ?? 0);
check('identical cabinets consolidate to the same lines',
  lineCount(linesAfterOne) === lineCount(linesAfterTwo),
  `"${linesAfterOne}" then "${linesAfterTwo}"`);
check('two cabinets are listed', cabList.children.length === 2,
  `${cabList.children.length} cards`);
check('kickplate frontage follows added cabinets',
  byId.get('k-fronts').textContent.replace(/,/g, '') === '1200 mm',
  byId.get('k-fronts').textContent);

/* end returns and stock material are job-level kickplate inputs */
{
  const endCount = byId.get('k-end-count');
  endCount.value = '2';
  endCount.fire('input');
  check('end cupboards use the job floor depth while depth is blank',
    byId.get('k-ends').textContent.replace(/,/g, '') === '1120 mm',
    byId.get('k-ends').textContent);

  const material = byId.get('k-material');
  material.value = 'wood';
  material.fire('change');
  check('changing kickplate material changes the stock length',
    /2700 mm wood length/.test(byId.get('k-buy').textContent),
    byId.get('k-buy').textContent);
}

/* floor corners remain manual instead of silently using their width */
famSelect.value = 'floor';
famSelect.fire('change');
cfgSelect.value = 'corner';
cfgSelect.fire('change');
widthInput.value = '900';
addButton.fire('click');
check('a corner cupboard asks for a measured kickplate allowance',
  !byId.get('k-corner-field').hidden && !byId.get('k-warnings').hidden,
  `field hidden ${byId.get('k-corner-field').hidden}, warnings hidden ${byId.get('k-warnings').hidden}`);
check('a corner width is excluded from automatic frontage',
  byId.get('k-fronts').textContent.replace(/,/g, '') === '1200 mm',
  byId.get('k-fronts').textContent);

const cornerAllowance = byId.get('k-corner-allowance');
cornerAllowance.value = '0';
cornerAllowance.fire('input');
check('explicit zero confirms adjoining runs cover the corner',
  byId.get('k-warnings').hidden && /2700 mm wood length/.test(byId.get('k-buy').textContent),
  byId.get('k-buy').textContent);

const cornerCard = cabList.children[2];
const cornerQty = cornerCard.children[0].descendants()
  .find((node) => node.tagName === 'INPUT');
cornerQty.value = '2';
cornerQty.fire('input');
check('changing a measured corner quantity requires a fresh measurement',
  cornerAllowance.value === '' && !byId.get('k-warnings').hidden
    && /Resolve the inputs above/.test(byId.get('k-buy').textContent),
  `allowance "${cornerAllowance.value}", result "${byId.get('k-buy').textContent}"`);

cornerAllowance.value = '0';
cornerAllowance.fire('input');
check('the changed corner can be explicitly measured again',
  byId.get('k-warnings').hidden && /2700 mm wood length/.test(byId.get('k-buy').textContent),
  byId.get('k-buy').textContent);
await new Promise((r) => setTimeout(r, 400));
{
  const saved = JSON.parse(store.get('mkitchens.cutlist.draft'));
  check('kickplate calculator settings are saved with the draft',
    saved.kickplate?.material === 'wood' && saved.kickplate?.endCount === 2
      && saved.kickplate?.cornerAllowance === 0,
    JSON.stringify(saved.kickplate));
}

/* a cabinet that cannot be built should be flagged, not crash */
famSelect.value = 'tall';
famSelect.fire('change');
cfgSelect.value = 'elo';
cfgSelect.fire('change');
widthInput.value = '300';
addButton.fire('click');
const alerts = byId.get('alerts');
check('an undersized oven housing raises an alert', alerts.children.length > 0);

/* the build view groups panels under one heading per cabinet */
const groupRows = parts.descendants()
  .filter((n) => n.className && n.className.includes('group-row'));
check('build view groups panels by cabinet', groupRows.length >= 2,
  `${groupRows.length} headings`);
check('each heading names the cabinet and its size', groupRows.every((g) => {
  const head = g.descendants().find((n) => n.className === 'group-head');
  return head && head.children.some((c) => c.className === 'group-name')
    && head.children.some((c) => c.className === 'group-size');
}));

/* changing an option must visibly confirm itself on the card */
const firstCard = cabList.children[0];
const subtitle = firstCard.descendants().find((n) => n.className === 'sub');
firstCard.descendants()
  .find((n) => n.tagName === 'BUTTON' && n.textContent === 'Options')
  .fire('click');

const shelvesInput = firstCard.children[1].descendants()
  .filter((n) => n.tagName === 'INPUT')
  .find((i) => {
    const l = i.parentNode && i.parentNode.children.find((c) => c.tagName === 'LABEL');
    return l && l.textContent === 'Shelves';
  });

if (!shelvesInput) {
  check('the options panel offers a shelf count', false, 'no Shelves input found');
} else {
  const wasSub = subtitle.textContent;
  const wasPanels = byId.get('t-panels').textContent;
  shelvesInput.value = '3';
  shelvesInput.fire('input');

  check('changing shelves changes the cutting list',
    byId.get('t-panels').textContent !== wasPanels,
    `panels stayed at ${wasPanels}`);
  check('changing shelves is confirmed on the cabinet card',
    subtitle.textContent !== wasSub && /3 shelves/.test(subtitle.textContent),
    `subtitle reads "${subtitle.textContent}"`);
}

/* height and depth can be overridden on any cabinet, and clearing them returns
   the cabinet to its family standard */
{
  const inputs = firstCard.children[1].descendants().filter((n) => n.tagName === 'INPUT');
  const labelOf = (i) => {
    const l = i.parentNode && i.parentNode.children.find((c) => c.tagName === 'LABEL');
    return l ? l.textContent : '';
  };
  const height = inputs.find((i) => labelOf(i) === 'Height');
  const depth = inputs.find((i) => labelOf(i) === 'Depth');

  check('the options panel offers height and depth', !!height && !!depth);

  if (height && depth) {
    check('height and depth show the family standard as a placeholder',
      Number(height.placeholder) > 0 && Number(depth.placeholder) > 0,
      `height "${height.placeholder}", depth "${depth.placeholder}"`);

    const standardArea = byId.get('t-area').textContent;
    height.value = '900';
    height.fire('input');
    const taller = byId.get('t-area').textContent;
    check('changing height re-cuts the panels', taller !== standardArea,
      `area stayed at ${standardArea}`);

    height.value = '';
    height.fire('input');
    check('clearing height returns the cabinet to standard',
      byId.get('t-area').textContent === standardArea,
      `expected ${standardArea}, got ${byId.get('t-area').textContent}`);
  }
}

/* the text size and theme controls stamp the root element */
{
  const sizeButtons = byId.get('size-toggle').querySelectorAll('button');
  const themeButtons = byId.get('theme-toggle').querySelectorAll('button');
  check('display controls rendered',
    sizeButtons.length === 3 && themeButtons.length === 3,
    `${sizeButtons.length} sizes, ${themeButtons.length} themes`);

  const large = sizeButtons.find((b) => b.dataset.size === 'large');
  byId.get('size-toggle').fire('click', { target: large });
  check('choosing a text size stamps the page',
    document.documentElement.getAttribute('data-size') === 'large',
    `data-size="${document.documentElement.getAttribute('data-size')}"`);

  const light = themeButtons.find((b) => b.dataset.theme === 'light');
  byId.get('theme-toggle').fire('click', { target: light });
  check('choosing a theme stamps the page',
    document.documentElement.getAttribute('data-theme') === 'light',
    `data-theme="${document.documentElement.getAttribute('data-theme')}"`);

  const auto = themeButtons.find((b) => b.dataset.theme === 'auto');
  byId.get('theme-toggle').fire('click', { target: auto });
  check('auto theme leaves the page unstamped',
    document.documentElement.getAttribute('data-theme') === undefined,
    `data-theme="${document.documentElement.getAttribute('data-theme')}"`);
}

/* saving and reusing a preset */
{
  const before = state1Count();
  const saveButton = firstCard.children[1].descendants()
    .find((n) => n.tagName === 'BUTTON' && n.textContent === 'Save as preset');
  check('cabinets can be saved as a preset', !!saveButton);

  if (saveButton) {
    saveButton.fire('click');
    const chips = byId.get('preset-list').children;
    check('a saved preset appears in the list', chips.length === 1,
      `${chips.length} presets`);

    if (chips.length) {
      const use = chips[0].children.find((c) => c.className === 'preset-use');
      use.fire('click');
      check('clicking a preset adds that cabinet',
        state1Count() === before + 1,
        `${before} then ${state1Count()}`);
    }
  }
}

function state1Count() {
  return cabList.children.filter((c) => (c.className || '').includes('cab')).length;
}

/* the export button produces a file */
{
  let downloaded = null;
  const realCreate = document.createElement;
  document.createElement = (tag) => {
    const node = realCreate(tag);
    if (String(tag).toLowerCase() === 'a') {
      node.click = () => { downloaded = node.download; };
    }
    return node;
  };

  byId.get('export-csv').fire('click');
  document.createElement = realCreate;

  check('the export button downloads a cutting list',
    typeof downloaded === 'string' && downloaded.endsWith('.csv'),
    `filename ${downloaded}`);
}

console.log(failures ? `\n${failures} failed.\n` : '\nAll interface checks passed.\n');
process.exit(failures ? 1 : 0);
