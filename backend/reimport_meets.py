"""One-off: re-import meets into their existing championships to backfill
results that older parser versions missed. Run with DATABASE_URL pointing
at production. Safe to re-run: confirm_import keeps existing results.

Usage: venv/bin/python manage.py shell -c "exec(open('reimport_meets.py').read())"
"""
import time

from importer.services import parse_file, confirm_import
from championships.models import Championship
from django.db.models import Count

import os

PAIRS = [
    # Relay squads collapsed + Lina MAHI same-name merge (2026-07 fix)
    ('../data/Algeria.2022.SCM.pdf', 48),
    # 11 individual results skipped at original import (GIUROIU/BAKR/DRIDI)
    (os.path.expanduser('~/Downloads/CHAMPIONNAT D\u0027\u00c9TE M_C.J_S ET TC - 04_08_2025 \u00a4 09_08_2025 - RADES.html'), 47),
    # Lebanon (id=52) was deleted from prod — skip
]

for path, cid in PAIRS:
    t0 = time.time()
    champ = Championship.objects.annotate(n=Count('results')).get(id=cid)
    before = champ.n
    print(f'=== {champ.name} (id={cid}) before={before}', flush=True)
    preview = parse_file(file_path=path)
    summary = confirm_import(preview, {}, championship_id=cid)
    after = Championship.objects.annotate(n=Count('results')).get(id=cid).n
    print(f'    created_results={summary.get("created_results")} '
          f'skipped_results={summary.get("skipped_results")} '
          f'created_swimmers={summary.get("created_swimmers")} '
          f'matched_swimmers={summary.get("matched_swimmers")} '
          f'after={after} (+{after - before}) '
          f'[{time.time() - t0:.0f}s]', flush=True)

print('DONE', flush=True)
