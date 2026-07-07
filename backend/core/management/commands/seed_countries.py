from django.core.management.base import BaseCommand
from core.models import Country


# Arab / GCC countries keep their existing codes (already referenced by data
# in the DB and by result files, e.g. KWT/OMA/LBY rather than the IOC KUW/OMA/LBA).
ARAB_COUNTRIES = [
    # GCC countries (also Arab)
    {'name': 'Saudi Arabia', 'code': 'KSA', 'region': 'GCC'},
    {'name': 'UAE', 'code': 'UAE', 'region': 'GCC'},
    {'name': 'Qatar', 'code': 'QAT', 'region': 'GCC'},
    {'name': 'Kuwait', 'code': 'KWT', 'region': 'GCC'},
    {'name': 'Bahrain', 'code': 'BHR', 'region': 'GCC'},
    {'name': 'Oman', 'code': 'OMA', 'region': 'GCC'},
    # Other Arab countries
    {'name': 'Egypt', 'code': 'EGY', 'region': 'ARAB'},
    {'name': 'Jordan', 'code': 'JOR', 'region': 'ARAB'},
    {'name': 'Lebanon', 'code': 'LBN', 'region': 'ARAB'},
    {'name': 'Syria', 'code': 'SYR', 'region': 'ARAB'},
    {'name': 'Iraq', 'code': 'IRQ', 'region': 'ARAB'},
    {'name': 'Palestine', 'code': 'PLE', 'region': 'ARAB'},
    {'name': 'Yemen', 'code': 'YEM', 'region': 'ARAB'},
    {'name': 'Libya', 'code': 'LBY', 'region': 'ARAB'},
    {'name': 'Tunisia', 'code': 'TUN', 'region': 'ARAB'},
    {'name': 'Algeria', 'code': 'ALG', 'region': 'ARAB'},
    {'name': 'Morocco', 'code': 'MAR', 'region': 'ARAB'},
    {'name': 'Sudan', 'code': 'SUD', 'region': 'ARAB'},
    {'name': 'Somalia', 'code': 'SOM', 'region': 'ARAB'},
    {'name': 'Mauritania', 'code': 'MTN', 'region': 'ARAB'},
    {'name': 'Djibouti', 'code': 'DJI', 'region': 'ARAB'},
    {'name': 'Comoros', 'code': 'COM', 'region': 'ARAB'},
]

# Rest of the world, keyed by IOC three-letter code (the codes used in swim
# result files). region='OTHER'. Arab nations are intentionally omitted here.
WORLD_COUNTRIES = [
    # --- Africa ---
    ('Angola', 'ANG'), ('Benin', 'BEN'), ('Botswana', 'BOT'), ('Burkina Faso', 'BUR'),
    ('Burundi', 'BDI'), ('Cameroon', 'CMR'), ('Cape Verde', 'CPV'),
    ('Central African Republic', 'CAF'), ('Chad', 'CHA'), ('Congo', 'CGO'),
    ('DR Congo', 'COD'), ('Ivory Coast', 'CIV'), ('Equatorial Guinea', 'GEQ'),
    ('Eritrea', 'ERI'), ('Eswatini', 'SWZ'), ('Ethiopia', 'ETH'), ('Gabon', 'GAB'),
    ('Gambia', 'GAM'), ('Ghana', 'GHA'), ('Guinea', 'GUI'), ('Guinea-Bissau', 'GBS'),
    ('Kenya', 'KEN'), ('Lesotho', 'LES'), ('Liberia', 'LBR'), ('Madagascar', 'MAD'),
    ('Malawi', 'MAW'), ('Mali', 'MLI'), ('Mauritius', 'MRI'), ('Mozambique', 'MOZ'),
    ('Namibia', 'NAM'), ('Niger', 'NIG'), ('Nigeria', 'NGR'), ('Rwanda', 'RWA'),
    ('Sao Tome and Principe', 'STP'), ('Senegal', 'SEN'), ('Seychelles', 'SEY'),
    ('Sierra Leone', 'SLE'), ('South Africa', 'RSA'), ('South Sudan', 'SSD'),
    ('Tanzania', 'TAN'), ('Togo', 'TOG'), ('Uganda', 'UGA'), ('Zambia', 'ZAM'),
    ('Zimbabwe', 'ZIM'),
    # --- Americas ---
    ('Antigua and Barbuda', 'ANT'), ('Argentina', 'ARG'), ('Aruba', 'ARU'),
    ('Bahamas', 'BAH'), ('Barbados', 'BAR'), ('Belize', 'BIZ'), ('Bermuda', 'BER'),
    ('Bolivia', 'BOL'), ('Brazil', 'BRA'), ('British Virgin Islands', 'IVB'),
    ('Canada', 'CAN'), ('Cayman Islands', 'CAY'), ('Chile', 'CHI'), ('Colombia', 'COL'),
    ('Costa Rica', 'CRC'), ('Cuba', 'CUB'), ('Dominica', 'DMA'),
    ('Dominican Republic', 'DOM'), ('Ecuador', 'ECU'), ('El Salvador', 'ESA'),
    ('Grenada', 'GRN'), ('Guatemala', 'GUA'), ('Guyana', 'GUY'), ('Haiti', 'HAI'),
    ('Honduras', 'HON'), ('Jamaica', 'JAM'), ('Mexico', 'MEX'), ('Nicaragua', 'NCA'),
    ('Panama', 'PAN'), ('Paraguay', 'PAR'), ('Peru', 'PER'), ('Puerto Rico', 'PUR'),
    ('Saint Kitts and Nevis', 'SKN'), ('Saint Lucia', 'LCA'),
    ('Saint Vincent and the Grenadines', 'VIN'), ('Suriname', 'SUR'),
    ('Trinidad and Tobago', 'TTO'), ('United States', 'USA'), ('Uruguay', 'URU'),
    ('Venezuela', 'VEN'), ('US Virgin Islands', 'ISV'),
    # --- Asia ---
    ('Afghanistan', 'AFG'), ('Bangladesh', 'BAN'), ('Bhutan', 'BHU'),
    ('Brunei', 'BRU'), ('Cambodia', 'CAM'), ('China', 'CHN'), ('Hong Kong', 'HKG'),
    ('India', 'IND'), ('Indonesia', 'INA'), ('Iran', 'IRI'), ('Japan', 'JPN'),
    ('Kazakhstan', 'KAZ'), ('North Korea', 'PRK'), ('South Korea', 'KOR'),
    ('Kyrgyzstan', 'KGZ'), ('Laos', 'LAO'), ('Macau', 'MAC'), ('Malaysia', 'MAS'),
    ('Maldives', 'MDV'), ('Mongolia', 'MGL'), ('Myanmar', 'MYA'), ('Nepal', 'NEP'),
    ('Pakistan', 'PAK'), ('Philippines', 'PHI'), ('Singapore', 'SGP'),
    ('Sri Lanka', 'SRI'), ('Chinese Taipei', 'TPE'), ('Tajikistan', 'TJK'),
    ('Thailand', 'THA'), ('Timor-Leste', 'TLS'), ('Turkmenistan', 'TKM'),
    ('Uzbekistan', 'UZB'), ('Vietnam', 'VIE'),
    # --- Europe ---
    ('Albania', 'ALB'), ('Andorra', 'AND'), ('Armenia', 'ARM'), ('Austria', 'AUT'),
    ('Azerbaijan', 'AZE'), ('Belarus', 'BLR'), ('Belgium', 'BEL'),
    ('Bosnia and Herzegovina', 'BIH'), ('Bulgaria', 'BUL'), ('Croatia', 'CRO'),
    ('Cyprus', 'CYP'), ('Czechia', 'CZE'), ('Denmark', 'DEN'), ('Estonia', 'EST'),
    ('Finland', 'FIN'), ('France', 'FRA'), ('Georgia', 'GEO'), ('Germany', 'GER'),
    ('Great Britain', 'GBR'), ('Greece', 'GRE'), ('Hungary', 'HUN'), ('Iceland', 'ISL'),
    ('Ireland', 'IRL'), ('Israel', 'ISR'), ('Italy', 'ITA'), ('Kosovo', 'KOS'),
    ('Latvia', 'LAT'), ('Liechtenstein', 'LIE'), ('Lithuania', 'LTU'),
    ('Luxembourg', 'LUX'), ('Malta', 'MLT'), ('Moldova', 'MDA'), ('Monaco', 'MON'),
    ('Montenegro', 'MNE'), ('Netherlands', 'NED'), ('North Macedonia', 'MKD'),
    ('Norway', 'NOR'), ('Poland', 'POL'), ('Portugal', 'POR'), ('Romania', 'ROU'),
    ('Russia', 'RUS'), ('San Marino', 'SMR'), ('Serbia', 'SRB'), ('Slovakia', 'SVK'),
    ('Slovenia', 'SLO'), ('Spain', 'ESP'), ('Sweden', 'SWE'), ('Switzerland', 'SUI'),
    ('Turkey', 'TUR'), ('Ukraine', 'UKR'),
    # --- Oceania ---
    ('Australia', 'AUS'), ('Cook Islands', 'COK'), ('Fiji', 'FIJ'), ('Guam', 'GUM'),
    ('Kiribati', 'KIR'), ('Marshall Islands', 'MHL'), ('Micronesia', 'FSM'),
    ('Nauru', 'NRU'), ('New Zealand', 'NZL'), ('Palau', 'PLW'),
    ('Papua New Guinea', 'PNG'), ('Samoa', 'SAM'), ('Solomon Islands', 'SOL'),
    ('Tonga', 'TGA'), ('Tuvalu', 'TUV'), ('Vanuatu', 'VAN'),
]


# IOC three-letter code → ISO 3166-1 alpha-2 code (used by flagcdn.com to
# render the flag). Stored in Country.flag_url.
FLAGS = {
    # Arab / GCC
    'KSA': 'sa', 'UAE': 'ae', 'QAT': 'qa', 'KWT': 'kw', 'BHR': 'bh', 'OMA': 'om',
    'EGY': 'eg', 'JOR': 'jo', 'LBN': 'lb', 'SYR': 'sy', 'IRQ': 'iq', 'PLE': 'ps',
    'YEM': 'ye', 'LBY': 'ly', 'TUN': 'tn', 'ALG': 'dz', 'MAR': 'ma', 'SUD': 'sd',
    'SOM': 'so', 'MTN': 'mr', 'DJI': 'dj', 'COM': 'km',
    # Africa
    'ANG': 'ao', 'BEN': 'bj', 'BOT': 'bw', 'BUR': 'bf', 'BDI': 'bi', 'CMR': 'cm',
    'CPV': 'cv', 'CAF': 'cf', 'CHA': 'td', 'CGO': 'cg', 'COD': 'cd', 'CIV': 'ci',
    'GEQ': 'gq', 'ERI': 'er', 'SWZ': 'sz', 'ETH': 'et', 'GAB': 'ga', 'GAM': 'gm',
    'GHA': 'gh', 'GUI': 'gn', 'GBS': 'gw', 'KEN': 'ke', 'LES': 'ls', 'LBR': 'lr',
    'MAD': 'mg', 'MAW': 'mw', 'MLI': 'ml', 'MRI': 'mu', 'MOZ': 'mz', 'NAM': 'na',
    'NIG': 'ne', 'NGR': 'ng', 'RWA': 'rw', 'STP': 'st', 'SEN': 'sn', 'SEY': 'sc',
    'SLE': 'sl', 'RSA': 'za', 'SSD': 'ss', 'TAN': 'tz', 'TOG': 'tg', 'UGA': 'ug',
    'ZAM': 'zm', 'ZIM': 'zw',
    # Americas
    'ANT': 'ag', 'ARG': 'ar', 'ARU': 'aw', 'BAH': 'bs', 'BAR': 'bb', 'BIZ': 'bz',
    'BER': 'bm', 'BOL': 'bo', 'BRA': 'br', 'IVB': 'vg', 'CAN': 'ca', 'CAY': 'ky',
    'CHI': 'cl', 'COL': 'co', 'CRC': 'cr', 'CUB': 'cu', 'DMA': 'dm', 'DOM': 'do',
    'ECU': 'ec', 'ESA': 'sv', 'GRN': 'gd', 'GUA': 'gt', 'GUY': 'gy', 'HAI': 'ht',
    'HON': 'hn', 'JAM': 'jm', 'MEX': 'mx', 'NCA': 'ni', 'PAN': 'pa', 'PAR': 'py',
    'PER': 'pe', 'PUR': 'pr', 'SKN': 'kn', 'LCA': 'lc', 'VIN': 'vc', 'SUR': 'sr',
    'TTO': 'tt', 'USA': 'us', 'URU': 'uy', 'VEN': 've', 'ISV': 'vi',
    # Asia
    'AFG': 'af', 'BAN': 'bd', 'BHU': 'bt', 'BRU': 'bn', 'CAM': 'kh', 'CHN': 'cn',
    'HKG': 'hk', 'IND': 'in', 'INA': 'id', 'IRI': 'ir', 'JPN': 'jp', 'KAZ': 'kz',
    'PRK': 'kp', 'KOR': 'kr', 'KGZ': 'kg', 'LAO': 'la', 'MAC': 'mo', 'MAS': 'my',
    'MDV': 'mv', 'MGL': 'mn', 'MYA': 'mm', 'NEP': 'np', 'PAK': 'pk', 'PHI': 'ph',
    'SGP': 'sg', 'SRI': 'lk', 'TPE': 'tw', 'TJK': 'tj', 'THA': 'th', 'TLS': 'tl',
    'TKM': 'tm', 'UZB': 'uz', 'VIE': 'vn',
    # Europe
    'ALB': 'al', 'AND': 'ad', 'ARM': 'am', 'AUT': 'at', 'AZE': 'az', 'BLR': 'by',
    'BEL': 'be', 'BIH': 'ba', 'BUL': 'bg', 'CRO': 'hr', 'CYP': 'cy', 'CZE': 'cz',
    'DEN': 'dk', 'EST': 'ee', 'FIN': 'fi', 'FRA': 'fr', 'GEO': 'ge', 'GER': 'de',
    'GBR': 'gb', 'GRE': 'gr', 'HUN': 'hu', 'ISL': 'is', 'IRL': 'ie', 'ISR': 'il',
    'ITA': 'it', 'KOS': 'xk', 'LAT': 'lv', 'LIE': 'li', 'LTU': 'lt', 'LUX': 'lu',
    'MLT': 'mt', 'MDA': 'md', 'MON': 'mc', 'MNE': 'me', 'NED': 'nl', 'MKD': 'mk',
    'NOR': 'no', 'POL': 'pl', 'POR': 'pt', 'ROU': 'ro', 'RUS': 'ru', 'SMR': 'sm',
    'SRB': 'rs', 'SVK': 'sk', 'SLO': 'si', 'ESP': 'es', 'SWE': 'se', 'SUI': 'ch',
    'TUR': 'tr', 'UKR': 'ua',
    # Oceania
    'AUS': 'au', 'COK': 'ck', 'FIJ': 'fj', 'GUM': 'gu', 'KIR': 'ki', 'MHL': 'mh',
    'FSM': 'fm', 'NRU': 'nr', 'NZL': 'nz', 'PLW': 'pw', 'PNG': 'pg', 'SAM': 'ws',
    'SOL': 'sb', 'TGA': 'to', 'TUV': 'tv', 'VAN': 'vu',
}


# Legacy IOC codes that older imports stored on Country rows. Renamed in
# place (keeps swimmer/championship FKs) so the seeder doesn't create a
# duplicate country under the new code.
LEGACY_CODE_RENAMES = {
    'KUW': 'KWT',  # Kuwait
    'LBA': 'LBY',  # Libya
    'LIB': 'LBN',  # Lebanon
}


class Command(BaseCommand):
    help = 'Seed all World Aquatics nations (Arab/GCC + rest of world) by IOC code'

    def handle(self, *args, **kwargs):
        # Migrate legacy-coded rows first so update_or_create matches them
        for old, new in LEGACY_CODE_RENAMES.items():
            legacy = Country.objects.filter(code=old).first()
            if not legacy:
                continue
            target = Country.objects.filter(code=new).first()
            if target:
                # Both exist: move every FK to the canonical row, drop legacy
                for rel in Country._meta.related_objects:
                    rel.related_model.objects.filter(
                        **{rel.field.name: legacy}
                    ).update(**{rel.field.name: target})
                legacy.delete()
            else:
                legacy.code = new
                legacy.save(update_fields=['code'])

        rows = list(ARAB_COUNTRIES)
        rows += [{'name': n, 'code': c, 'region': 'OTHER'} for n, c in WORLD_COUNTRIES]

        for c in rows:
            Country.objects.update_or_create(
                code=c['code'],
                defaults={
                    'name': c['name'],
                    'region': c['region'],
                    'flag_url': FLAGS.get(c['code'], ''),
                }
            )
        self.stdout.write(self.style.SUCCESS(f'Seeded {len(rows)} countries'))
