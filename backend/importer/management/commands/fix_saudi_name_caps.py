from django.core.management.base import BaseCommand

from importer.saudi_scraper import format_latin_name


def _is_all_caps(name):
    words = (name or '').split()
    alpha = [w for w in words if any(c.isalpha() for c in w)]
    return len(words) >= 2 and alpha and all(w.isupper() for w in alpha)


class Command(BaseCommand):
    help = ('Reformat ALL-CAPS swimmer names from Saudi (SSF) imports to the '
            'site convention "Given SURNAME" (Zied FAISAL ALSARRAJ). Only '
            'swimmers with results in KSA meets are touched; manual edits '
            'and relay placeholders are never changed.')

    def handle(self, *args, **kwargs):
        from swimmers.models import Swimmer
        from championships.models import Result

        swimmers = (Swimmer.objects
                    .filter(results__championship__country__code='KSA',
                            is_relay_team=False, manually_edited=False)
                    .distinct())
        fixed = 0
        for s in swimmers:
            if not _is_all_caps(s.name):
                continue
            new = format_latin_name(s.name)
            if new != s.name:
                s.name = new
                s.save(update_fields=['name'])
                fixed += 1
        self.stdout.write(f'Fixed {fixed} swimmer names')

        # Relay lineups in Saudi meets carry the same ALL-CAPS names
        legs_fixed = 0
        relay_results = Result.objects.filter(
            championship__country__code='KSA', relay_swimmers__isnull=False)
        for r in relay_results:
            changed = False
            for leg in (r.relay_swimmers or []):
                if isinstance(leg, dict) and _is_all_caps(leg.get('name', '')):
                    new = format_latin_name(leg['name'])
                    if new != leg['name']:
                        leg['name'] = new
                        changed = True
            if changed:
                r.save(update_fields=['relay_swimmers'])
                legs_fixed += 1
        self.stdout.write(f'Fixed lineups on {legs_fixed} relay results')
