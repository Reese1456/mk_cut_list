"""
Extract a golden-master fixture set from the original cutting-list workbook.

Why this exists
---------------
The spreadsheet contains 56 fully worked cabinet examples with every dimension
already calculated. That makes it the best possible test oracle for the new
engine: rather than testing our rules against our own reading of the rules, we
test them against the real thing the workshop has been cutting from.

This script reads `new cut list master 2.xlsx` and writes `public/tests/fixtures.js`.

Canonical orientation
---------------------
The spreadsheet sometimes enters a panel rotated - narrow cabinets have their
base and shelf rows written as (depth x width) instead of (width x depth), with
the edge banding moved from the "long edge" column to the "short edge" column.
That is a presentation choice, not a different panel.

So both sides of the comparison are canonicalised the same way:

    l  = the larger dimension
    w  = the smaller dimension
    eL = number of banded edges running the length of l
    eS = number of banded edges running the length of w

Under that rule a rotated entry and an unrotated one collapse to the same
record, and only genuine disagreements survive to be reported.

Run:  python tools/extract_fixtures.py
"""

import json
import re
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
WORKBOOK = ROOT / "new cut list master 2.xlsx"
OUT = ROOT / "public" / "tests" / "fixtures.js"

# Header row of each cabinet block on the `cut list` sheet.
BLOCK_ROWS = [
    11, 18, 24, 31, 40, 51, 60, 67, 78, 84, 91, 98, 109, 116, 123, 130, 137,
    144, 151, 160, 171, 180, 187, 194, 200, 206, 212, 218, 224, 230, 235, 241,
    247, 253, 259, 265, 271, 277, 282, 288, 294, 299, 305, 311, 318, 327, 334,
    341, 348, 355, 362, 369, 376, 380, 384, 388,
]

# Blocks whose descriptions are known to be shifted one row up in the source
# (fault 9). Extracted positionally; the labels are corrected here so the
# fixture reflects the panels that are actually cut.
LABEL_OVERRIDES = {
    305: ["sides", "top and bottom", "back", "shelves"],
}


def qty_multiplier(formula, header, input_values, resolved):
    """Return the per-cabinet multiplier from a quantity formula.

    The quantity column is normally the cabinet quantity times a small integer,
    e.g. `=+A12*2` for a pair of sides. Three other shapes occur:

      * `=+B376*'input sheet'!D97` - the bic blocks take their shelf count from
        the input sheet, so the multiplier is that cell's value.
      * `=+B378` pointing at another part row in the same block - the cleat
        count follows the shelf count. Resolved from rows already processed.
      * a hard-typed `0` (fault 4).

    Returns (multiplier, raw); multiplier is None only if the shape is still
    unrecognised, which the caller records rather than hides.
    """
    if formula is None:
        return None, None
    if isinstance(formula, (int, float)):
        return float(formula), str(formula)

    raw = str(formula)
    s = raw.lstrip("=+").replace("++", "")

    # `A12*2`, `B40*4`, `A32*8`
    m = re.fullmatch(r"\$?[A-Z]\$?(\d+)\*(\d+)", s)
    if m:
        return float(m.group(2)), raw

    # `B376*'input sheet'!D97` - multiplier read from the input sheet
    m = re.fullmatch(r"\$?[A-Z]\$?\d+\*'input sheet'!\$?([A-Z]+)\$?(\d+)", s)
    if m:
        cell = input_values[f"{m.group(1)}{m.group(2)}"].value
        return (float(cell), raw) if isinstance(cell, (int, float)) else (None, raw)

    # A bare reference: either the block's own quantity cell (multiplier 1) or
    # another part row in the same block, whose multiplier it inherits.
    m = re.fullmatch(r"\$?([A-Z])\$?(\d+)", s)
    if m:
        col, row = m.group(1), int(m.group(2))
        if row in (header, header + 1):
            return 1.0, raw
        if col == "B" and row in resolved:
            return resolved[row], raw
        return 1.0, raw

    return None, raw


def canonical(l, w, edge_long, edge_short):
    """Put a panel into canonical orientation (see module docstring)."""
    el = int(edge_long or 0)
    es = int(edge_short or 0)
    if l is None or w is None:
        return None
    if w > l:
        return {"l": w, "w": l, "eL": es, "eS": el}
    return {"l": l, "w": w, "eL": el, "eS": es}


def main():
    if not WORKBOOK.exists():
        raise SystemExit(f"Workbook not found: {WORKBOOK}")

    wb_formulas = openpyxl.load_workbook(WORKBOOK, data_only=False)
    wb_values = openpyxl.load_workbook(WORKBOOK, data_only=True)
    formulas = wb_formulas["cut list"]
    values = wb_values["cut list"]
    input_values = wb_values["input sheet"]

    ends = BLOCK_ROWS[1:] + [392]
    blocks = []

    for header, end in zip(BLOCK_ROWS, ends):
        rows = range(header, end)

        family = values[f"C{header}"].value
        col_d = values[f"D{header}"].value
        col_e = values[f"E{header}"].value
        width = values[f"A{header}"].value

        # The config label sits in D or E depending on the block - drawer
        # blocks put the runner depth in D and the config name in E, door
        # blocks put the config in D and the door count in E.
        if isinstance(col_e, str):
            config, detail = col_e, col_d
        elif isinstance(col_d, str):
            config, detail = col_d, col_e
        else:
            config, detail = None, col_e

        # Which input-sheet cell supplies this block's quantity? Two blocks
        # share one cell (fault 1), which this records rather than hides.
        qty_formula = formulas[f"A{header + 1}"].value or formulas[f"B{header}"].value
        qty_source = None
        if isinstance(qty_formula, str):
            m = re.search(r"'input sheet'!\$?([A-Z]+)\$?(\d+)", qty_formula)
            if m:
                qty_source = f"{m.group(1)}{m.group(2)}"

        parts = []
        resolved = {}
        overrides = LABEL_OVERRIDES.get(header)
        for row in rows:
            l = values[f"C{row}"].value
            w = values[f"D{row}"].value
            if not isinstance(l, (int, float)) or not isinstance(w, (int, float)):
                continue

            desc = values[f"J{row}"].value
            desc = str(desc).strip().lower() if desc else None
            if overrides is not None:
                idx = len(parts)
                desc = overrides[idx] if idx < len(overrides) else desc
            if desc in (None, "none", "floor", "0"):
                continue

            mult, raw = qty_multiplier(
                formulas[f"B{row}"].value, header, input_values, resolved
            )
            if mult is not None:
                resolved[row] = mult
            panel = canonical(l, w, values[f"E{row}"].value, values[f"F{row}"].value)
            part = {"row": row, "desc": desc, "qtyPer": mult, **panel}
            if mult is None:
                part["qtyFormula"] = raw
            parts.append(part)

        # Door / drawer-front geometry from the header row. Column layout
        # varies by config, so this is stored raw for reference rather than
        # interpreted - fronts are v2 work.
        fronts = {}
        for col in "FGHIJ":
            v = values[f"{col}{header}"].value
            if isinstance(v, (int, float)):
                fronts[col] = v

        blocks.append({
            "block": header,
            "family": family,
            "config": config,
            "detail": detail,
            "width": width,
            "qtySource": qty_source,
            "fronts": fronts,
            "parts": parts,
        })

    globals_ = {
        "floorHeight": values["C3"].value,
        "floorDepth": values["C4"].value,
        "wallTallHeight": values["C5"].value,
        "wallStdHeight": values["C6"].value,
        "wallDepth": values["C7"].value,
        "tallHeight": values["C8"].value,
        "tallDepth": values["C9"].value,
    }

    payload = {
        "_comment": (
            "Generated by tools/extract_fixtures.py from 'new cut list master 2.xlsx'. "
            "Do not edit by hand - re-run the script instead. Panels are in canonical "
            "orientation: l >= w, eL = banded edges of length l, eS = banded edges of length w."
        ),
        "globals": globals_,
        "blocks": blocks,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    # Written as an ES module rather than plain JSON so the same file loads in
    # Node and in a browser opened straight from disk, with no fetch involved.
    header = "// Generated by tools/extract_fixtures.py - do not edit by hand.\n"
    body = "export const FIXTURES = " + json.dumps(payload, indent=2) + ";\n"
    OUT.write_text(header + body, encoding="utf-8")

    total_parts = sum(len(b["parts"]) for b in blocks)
    unresolved = sum(1 for b in blocks for p in b["parts"] if p["qtyPer"] is None)
    print(f"wrote {OUT.relative_to(ROOT)}")
    print(f"  blocks:            {len(blocks)}")
    print(f"  part rows:         {total_parts}")
    print(f"  unresolved qty:    {unresolved}")


if __name__ == "__main__":
    main()
