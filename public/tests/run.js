/**
 * Test runner.
 *
 *     npm test
 *     node tests/run.js --diffs     also print the accepted-change report
 *
 * Exits non-zero if anything fails, so it can be wired into CI later.
 */

import { FIXTURES } from './fixtures.js';
import { runGoldenMaster } from './golden.js';
import { runInvariants } from './invariants.js';
import { runCatalogTests } from './catalog.js';
import { runSweep } from './sweep.js';
import { allChanges } from './diff-allowlist.js';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const OFF = '\x1b[0m';

let failed = 0;

function heading(text) {
  console.log(`\n${BOLD}${text}${OFF}`);
  console.log(DIM + '-'.repeat(text.length) + OFF);
}

/* ---------------------------------------------------------------- *
 * 1. Golden master
 * ---------------------------------------------------------------- */

heading('Golden master - 56 cabinet blocks from the original workbook');

const golden = runGoldenMaster(FIXTURES);
const exact = golden.filter((r) => r.status === 'exact');
const normalised = golden.filter((r) => r.status === 'normalised');
const broken = golden.filter((r) => r.status !== 'exact' && r.status !== 'normalised');

for (const r of broken) {
  failed++;
  console.log(`\n  ${RED}FAIL${OFF} block ${r.block}  ${r.family || ''}/${r.config || ''} w=${r.width || '?'}`);
  for (const m of r.missing || []) console.log(`       sheet only : ${m}`);
  for (const e of r.extra || []) console.log(`       engine only: ${e}`);
  if (r.detail) console.log(`       ${r.detail}`);
}

console.log(`  ${GREEN}${exact.length}${OFF} blocks reproduce the spreadsheet exactly`);
console.log(`  ${YELLOW}${normalised.length}${OFF} blocks differ only by accepted normalisations`);
if (broken.length) console.log(`  ${RED}${broken.length}${OFF} blocks failed`);

/* ---------------------------------------------------------------- *
 * 2. Invariants
 * ---------------------------------------------------------------- */

heading('Invariants');

const invariants = runInvariants();
for (const r of invariants) {
  if (r.status === 'pass') {
    console.log(`  ${GREEN}pass${OFF}  ${r.name}`);
  } else {
    failed++;
    console.log(`  ${RED}FAIL${OFF}  ${r.name}`);
    console.log(`        ${r.detail}`);
  }
}

/* ---------------------------------------------------------------- *
 * 3. Catalogue integration
 * ---------------------------------------------------------------- */

heading('Catalogue - every option the interface offers');

const catalog = runCatalogTests();
for (const r of catalog) {
  if (r.status === 'pass') {
    console.log(`  ${GREEN}pass${OFF}  ${r.name}`);
  } else {
    failed++;
    console.log(`  ${RED}FAIL${OFF}  ${r.name}`);
    console.log(`        ${r.detail}`);
  }
}

/* ---------------------------------------------------------------- *
 * 4. Width sweep
 * ---------------------------------------------------------------- */

heading('Width sweep - every family, 100 mm to 1200 mm, one millimetre at a time');

const sweep = runSweep();
if (sweep.failureCount === 0) {
  console.log(
    `  ${GREEN}pass${OFF}  ${sweep.cabinets.toLocaleString()} cabinets, ` +
    `${sweep.panels.toLocaleString()} panels, no silent bad output`,
  );
  console.log(`  ${DIM}${sweep.warned.toLocaleString()} cabinets correctly flagged as unbuildable${OFF}`);
} else {
  failed += sweep.failureCount;
  console.log(`  ${RED}${sweep.failureCount} failures${OFF} (first 20)`);
  for (const f of sweep.failures) console.log(`       ${f}`);
}

/* ---------------------------------------------------------------- *
 * 5. Accepted changes report
 * ---------------------------------------------------------------- */

if (process.argv.includes('--diffs')) {
  heading('Accepted changes - every value that now differs from the spreadsheet');
  console.log(
    `  ${DIM}Review these against a job you have already built.${OFF}\n`,
  );
  for (const c of allChanges()) {
    console.log(`  block ${String(c.block).padEnd(4)} ${DIM}fault ${c.fault}${OFF}`);
    console.log(`    was : ${c.sheet}`);
    console.log(`    now : ${c.engine}`);
    console.log(`    why : ${c.reason}\n`);
  }
}

/* ---------------------------------------------------------------- *
 * Result
 * ---------------------------------------------------------------- */

console.log();
if (failed === 0) {
  console.log(`${GREEN}${BOLD}All checks passed.${OFF}`);
  if (!process.argv.includes('--diffs')) {
    console.log(`${DIM}Run with --diffs to see the ${allChanges().length} accepted changes.${OFF}`);
  }
} else {
  console.log(`${RED}${BOLD}${failed} check(s) failed.${OFF}`);
  process.exitCode = 1;
}
