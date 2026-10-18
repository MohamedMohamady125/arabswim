"""Full re-scrape of the Saudi Swimming Federation site into the standard
2-sheet Individual/Relay Excel, now including the DoB column.

Scrapes every meet dated on or before CUTOFF (default 2026-10-01) across all
years the site publishes, and writes the workbook to OUT_PATH. Checkpoints
every few meets so a long run can't lose everything.

Usage:
  python scrape_saudi_to_excel.py
"""
import os
import sys
from datetime import date

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "arabswim.settings")
django.setup()

import pandas as pd  # noqa: E402

from importer import saudi_scraper as SS  # noqa: E402
from importer.saudi_scraper import IND_COLS, REL_COLS  # noqa: E402

OUT_PATH = "/Users/mohamedmohamady/arabswim/Saudi Results2.xlsx"
CKPT_PATH = "/Users/mohamedmohamady/arabswim/Saudi Results2.checkpoint.xlsx"
CUTOFF = date(2026, 10, 1)        # include meets dated on/before this
YEARS = [2023, 2024, 2025, 2026]  # years the site publishes
WORKERS = 12


def write_xlsx(path, ind, rel):
    ind_df = pd.DataFrame(ind, columns=IND_COLS)
    rel_df = pd.DataFrame(rel, columns=REL_COLS)
    with pd.ExcelWriter(path, engine="openpyxl") as xl:
        ind_df.to_excel(xl, sheet_name="Individual", index=False)
        rel_df.to_excel(xl, sheet_name="Relay", index=False)


def main():
    # Gather every competition across the published years, deduped.
    comps, seen = [], set()
    for year in YEARS:
        print(f"Scanning {year}…", flush=True)
        for c in SS.parse_competitions(SS.fetch(f"{SS.BASE}{SS.LIST_PATH}?annee={year}")):
            d = SS._parse_site_date(c.get("date"))
            if d is None or d > CUTOFF:
                continue
            key = (c.get("competition"), c.get("date"), c.get("lieu"))
            if key in seen:
                continue
            seen.add(key)
            c["_date"] = d
            comps.append(c)
    comps.sort(key=lambda c: c["_date"])
    print(f"{len(comps)} meets to scrape (<= {CUTOFF})", flush=True)

    ind_all, rel_all = [], []
    for i, comp in enumerate(comps, 1):
        label = comp.get("lieu") or comp.get("competition")
        try:
            ind, rel = SS.crawl_meet(comp, workers=WORKERS)
            ind_all += ind
            rel_all += rel
            print(f"{i}/{len(comps)} {comp.get('date')} {label}: "
                  f"+{len(ind)} ind, +{len(rel)} rel "
                  f"(total {len(ind_all)}/{len(rel_all)})", flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"{i}/{len(comps)} {comp.get('date')} {label}: ERROR {e}",
                  flush=True)
        if i % 5 == 0:
            write_xlsx(CKPT_PATH, ind_all, rel_all)

    write_xlsx(OUT_PATH, ind_all, rel_all)
    if os.path.exists(CKPT_PATH):
        os.remove(CKPT_PATH)
    print(f"DONE: {len(ind_all)} individual, {len(rel_all)} relay rows -> {OUT_PATH}",
          flush=True)


if __name__ == "__main__":
    main()
