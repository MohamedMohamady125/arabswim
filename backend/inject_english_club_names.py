"""Replace Arabic club names / federation codes with English names.

Loads saudi_clubs_english.csv ({arabic_or_code -> english_name}) and rewrites
matching values in Result.team and Swimmer.club. Values with no mapping (e.g.
unknown codes, or stray swim-time strings) are left untouched.

Usage:
  DRY RUN:  python inject_english_club_names.py
  APPLY:    python inject_english_club_names.py --apply
"""
import os
import sys
import csv

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "arabswim.settings")
django.setup()

from django.db.models import Count  # noqa: E402
from championships.models import Result  # noqa: E402
from swimmers.models import Swimmer  # noqa: E402

CSV_PATH = "/Users/mohamedmohamady/arabswim/saudi_clubs_english.csv"


def load_mapping():
    m = {}
    with open(CSV_PATH, encoding="utf-8") as f:
        r = csv.reader(f)
        next(r)  # header
        for row in r:
            if len(row) >= 2 and row[0].strip() and row[1].strip():
                m[row[0].strip()] = row[1].strip()
    return m


def main():
    apply = "--apply" in sys.argv
    m = load_mapping()
    print(f"Loaded {len(m)} source->english mappings")

    result_total = 0
    swimmer_total = 0

    for src, eng in m.items():
        if src == eng:
            continue
        rc = Result.objects.filter(team=src).count()
        sc = Swimmer.objects.filter(club=src).count()
        if rc or sc:
            print(f"  {src!r} -> {eng!r}  results={rc} swimmers={sc}")
        if apply:
            Result.objects.filter(team=src).update(team=eng)
            Swimmer.objects.filter(club=src).update(club=eng)
        result_total += rc
        swimmer_total += sc

    print(f"\n{'APPLIED' if apply else 'DRY RUN'}: "
          f"{result_total} Result.team rows, {swimmer_total} Swimmer.club rows")
    if not apply:
        print("Re-run with --apply to write changes.")


if __name__ == "__main__":
    main()
