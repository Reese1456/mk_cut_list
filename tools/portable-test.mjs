import assert from 'node:assert/strict';
import { DEFAULT_GLOBALS, DEFAULT_KICKPLATE_SETTINGS } from '../public/js/constants.js';
import { FAMILIES } from '../public/js/catalog.js';
import { encodeFile, decodeFile } from '../public/js/portable.js';
import { expandCabinet, consolidate, totalArea, totalEdging, calculateKickplateRequirement } from '../public/js/rules.js';
import { cutlistRows, toCsv } from '../public/js/csv.js';

const job = {
  job: { client: 'Test kitchen', reference: 'ROUNDTRIP', boardColour: 'Oak', edgeColour: 'Oak', gola: true },
  globals: { ...DEFAULT_GLOBALS, floorHeight: 780, floorDepth: 600, kickHeight: 100 },
  kickplate: { ...DEFAULT_KICKPLATE_SETTINGS, endCount: 2, endDepth: 570, cornerAllowance: 0 },
  cabinets: [
    { id:'narrow', type:'floor', config:'doors', width:300, qty:2, label:'Narrow', overrides:{height:740, depth:560, shelves:2} },
    { id:'wide', type:'floor', config:'doors', width:900, qty:3, label:'Wide', overrides:{shelves:0} },
    { id:'corner', type:'floor', config:'corner', width:900, qty:1, label:'Corner', overrides:{legWidth:950} },
    { id:'drawers', type:'floor', config:'drawers', width:630, qty:2, label:'Drawers', overrides:{drawers:3, runnerDepth:450} },
  ], view:'consolidated',
};
job.kickplate.cornerSignature = calculateKickplateRequirement(job.cabinets, job.kickplate, job.globals).cornerSignature;
function output(s) {
  const parts = consolidate(s.cabinets.flatMap(c => expandCabinet(c, {...s.globals, gola:s.job.gola}).parts));
  return { parts, area:totalArea(parts), edging:totalEdging(parts), csv:toCsv(cutlistRows(s.job, parts, {thickness:s.globals.boardThickness})), kickplate:calculateKickplateRequirement(s.cabinets,s.kickplate,s.globals) };
}
const restored = decodeFile(encodeFile('job', job), 'job');
assert.deepEqual(restored, job);
assert.deepEqual(output(restored), output(job));
assert.equal(output(restored).kickplate.complete, output(job).kickplate.complete);
// Explicit independent example: 300 mm floor unit, 16 mm board, 740 high.
const narrow = expandCabinet(restored.cabinets[0], restored.globals).parts;
assert.ok(narrow.some(p => p.l === 560 && p.w === 268));
assert.ok(narrow.some(p => p.l === 723 && p.w === 268));
// Every catalogue family survives portability, including both panel orientations.
for (const f of FAMILIES) for (const c of f.configs) {
  const example = structuredClone(job);
  example.cabinets = [{id:'catalog',type:f.id,config:c.id,width:900,qty:2,label:'Catalogue',overrides:{}}];
  assert.deepEqual(output(decodeFile(encodeFile('job', example),'job')),output(example));
}
restored.cabinets[0].width = 310;
assert.equal(calculateKickplateRequirement(restored.cabinets, restored.kickplate, restored.globals).complete, false);
const presets = job.cabinets.map(c => ({id:c.id,name:c.label,type:c.type,config:c.config,width:c.width,overrides:c.overrides}));
assert.deepEqual(decodeFile(encodeFile('presets',presets),'presets'),presets);
for (const mutate of [
  s => { s.cabinets[0].qty = 0; },
  s => { s.cabinets[0].overrides.height = ''; },
  s => { s.cabinets[0].overrides.back = ''; },
  s => { s.cabinets[0].overrides.aperture = ''; },
  s => { s.cabinets[0].overrides.shelves = 1.5; },
  s => { s.cabinets[0].qty = 1.5; },
  s => { s.cabinets[0].width = '300'; },
  s => { s.cabinets[0].type = 'unknown'; },
  s => { s.cabinets[0].overrides.shelves = -1; },
  s => { s.globals.floorHeight = null; },
  s => { s.kickplate.endCount = -1; },
  s => { s.cabinets[1].id = s.cabinets[0].id; },
]) { const invalid = structuredClone(job); mutate(invalid); assert.throws(() => decodeFile(encodeFile('job',invalid),'job')); }
assert.throws(() => decodeFile('{','job'));
assert.throws(() => decodeFile(encodeFile('presets',presets),'job'));
assert.throws(() => decodeFile(encodeFile('job',job).replace('"version": 1','"version": 2'),'job'));
assert.throws(() => decodeFile(encodeFile('presets',[...presets,{...presets[0],width:0}]),'presets'));
assert.deepEqual(job.cabinets[0].width,300);
console.log('Portable files: job and preset round trips, catalogue outputs, CSV/totals, stale corner measurements and invalid-file rejection passed.');
