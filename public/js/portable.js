/** Versioned portable files; validation never calculates panel geometry. */
import { DEFAULT_GLOBALS, KICKPLATE_MATERIALS } from './constants.js';
import { config } from './catalog.js';
const clone = value => JSON.parse(JSON.stringify(value));
const object = x => x && typeof x === 'object' && !Array.isArray(x);
const fail = () => { throw new Error('Invalid or unsupported MKitchens file. Nothing was replaced.'); };
const finite = x => typeof x === 'number' && Number.isFinite(x);
export function validateCabinet(c, preset = false) {
  if (!object(c) || !config(c.type, c.config) || !finite(c.width) || c.width <= 0 || !object(c.overrides)) fail();
  if (preset ? typeof c.name !== 'string' || !c.name.trim() : typeof c.id !== 'string' || !Number.isInteger(c.qty) || c.qty < 1 || typeof c.label !== 'string') fail();
  for (const [key, value] of Object.entries(c.overrides)) {
    if (!['shelves', 'fixedShelves', 'doors', 'drawers', 'cleats', 'height', 'depth', 'runnerDepth', 'legWidth', 'apertureBottom', 'back', 'aperture'].includes(key)) fail();
    if (value === null) continue;
    if (['shelves', 'fixedShelves', 'doors', 'drawers', 'cleats'].includes(key)) { if (!Number.isInteger(value) || value < 0) fail(); }
    else if (['height', 'depth', 'runnerDepth', 'legWidth', 'apertureBottom'].includes(key)) { if (!finite(value) || value < 0) fail(); }
    else if (key === 'back') { if (typeof value !== 'boolean') fail(); }
    else if (key === 'aperture') { if (!['single', 'double', 'compact'].includes(value) && !(finite(value) && value > 0)) fail(); }
    else fail();
  }
  return clone(c);
}
export function validateJob(s) {
  if (!object(s) || !object(s.job) || !object(s.globals) || !object(s.kickplate) || !Array.isArray(s.cabinets) || !['by-cabinet', 'consolidated'].includes(s.view)) fail();
  for (const key of ['client', 'reference', 'boardColour', 'edgeColour']) if (typeof s.job[key] !== 'string') fail();
  if (typeof s.job.gola !== 'boolean') fail();
  for (const key of Object.keys(DEFAULT_GLOBALS)) if (!finite(s.globals[key]) || s.globals[key] <= 0) fail();
  const k = s.kickplate;
  if (!Object.hasOwn(KICKPLATE_MATERIALS, k.material) || !Number.isInteger(k.endCount) || k.endCount < 0) fail();
  for (const key of ['endDepth', 'cornerAllowance']) if (k[key] !== null && (!finite(k[key]) || k[key] < 0)) fail();
  if (k.cornerSignature !== null && typeof k.cornerSignature !== 'string') fail();
  const cabinets = s.cabinets.map(c => validateCabinet(c));
  if (new Set(cabinets.map(c => c.id)).size !== cabinets.length) fail();
  return clone({ job: s.job, globals: s.globals, kickplate: k, cabinets, view: s.view });
}
export function encodeFile(kind, data) { return JSON.stringify({ format: 'mkitchens', version: 1, kind, data }, null, 2); }
export function decodeFile(text, kind) {
  const file = JSON.parse(text);
  if (!object(file) || file.format !== 'mkitchens' || file.version !== 1 || file.kind !== kind) fail();
  if (kind === 'job') return validateJob(file.data);
  if (kind !== 'presets' || !Array.isArray(file.data)) fail();
  return file.data.map(p => validateCabinet(p, true));
}
