/**
 * MKitchens Cutlist Manager - export.
 *
 * Produces the file that goes to the board supplier.
 *
 * ---------------------------------------------------------------------------
 * Why the columns are what they are
 * ---------------------------------------------------------------------------
 * The trade names the four edges of a panel L1, L2, W1, W2 - the two long
 * edges, then the two short ones. A shelf is banded L1; a cabinet side is
 * banded L1 and W1; a drawer base has none. Our panels record a count per
 * dimension and always leave the engine with the longer side first, so the
 * mapping is direct: one long edge banded is L1, two is L1 and L2.
 *
 * Name, Length, Width, Quantity and Material are the five fields MaxCut needs
 * to import a job. Everything else either maps through its column mapper or is
 * ignored, so the same file opens as a plain table in Excel and imports into
 * MaxCut without being edited first.
 *
 * There is no grain column. Grain runs the long way - up the height of a door
 * or panel - and the supplier reads that off the dimensions, which is why
 * every part leaves the engine with its longer side first.
 * ---------------------------------------------------------------------------
 */

/** Quote a value only when it needs it, and never emit "undefined". */
function cell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Join rows of values into CSV text with the line ending Excel expects. */
export function toCsv(rows) {
  return rows.map((row) => row.map(cell).join(',')).join('\r\n');
}

/**
 * Turn an edge-banding count into the trade's per-edge notation.
 * One banded edge is the visible one, so it takes the first slot.
 */
function edges(count) {
  return [count >= 1 ? 'Y' : '', count >= 2 ? 'Y' : ''];
}

export const COLUMNS = [
  'Name', 'Length', 'Width', 'Quantity',
  'Material', 'Thickness',
  'L1', 'L2', 'W1', 'W2', 'Edging',
  'Cabinet', 'Part',
];

/**
 * Build the cutting list rows.
 *
 * @param job    the job details - client, reference, colours
 * @param parts  consolidated parts from the engine
 * @param opts   { thickness }
 */
export function cutlistRows(job, parts, { thickness = 16 } = {}) {
  const material = job.boardColour?.trim() || 'Melamine';
  const edging = job.edgeColour?.trim() || material;

  const rows = [COLUMNS];

  for (const p of parts) {
    const [l1, l2] = edges(p.eL);
    const [w1, w2] = edges(p.eS);
    const banded = p.eL > 0 || p.eS > 0;
    const cabinets = p.cabinets ? p.cabinets.join(' / ') : (p.cabinet ?? '');

    rows.push([
      // MaxCut wants a name per line; the cabinet plus the part reads well on
      // a label and stays unique enough to be useful in the workshop.
      `${cabinets} ${p.desc}`.trim(),
      p.l,
      p.w,
      p.qty,
      material,
      thickness,
      l1, l2, w1, w2,
      banded ? edging : '',
      cabinets,
      p.desc,
    ]);
  }

  return rows;
}

/** A filename that says what the job is without needing to open it. */
export function cutlistFilename(job, date = new Date()) {
  const stamp = date.toISOString().slice(0, 10);
  const parts = ['MKitchens', 'CutList'];
  if (job.client?.trim()) parts.push(job.client.trim());
  if (job.reference?.trim()) parts.push(job.reference.trim());
  parts.push(stamp);

  return `${parts.join('_').replace(/[^A-Za-z0-9._-]+/g, '-')}.csv`;
}

/**
 * Hand the file to the browser.
 *
 * A BOM is prepended so Excel opens it as UTF-8 rather than mangling any
 * accented characters in a client's name.
 */
export function downloadCsv(filename, text) {
  const blob = new Blob([`﻿${text}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();

  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
