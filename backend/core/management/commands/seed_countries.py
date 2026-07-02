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


class Command(BaseCommand):
    help = 'Seed all World Aquatics nations (Arab/GCC + rest of world) by IOC code'

    def handle(self, *args, **kwargs):
        rows = list(ARAB_COUNTRIES)
        rows += [{'name': n, 'code': c, 'region': 'OTHER'} for n, c in WORLD_COUNTRIES]

        for c in rows:
            Country.objects.update_or_create(
                code=c['code'],
                defaults={'name': c['name'], 'region': c['region']}
            )
        self.stdout.write(self.style.SUCCESS(f'Seeded {len(rows)} countries'))
