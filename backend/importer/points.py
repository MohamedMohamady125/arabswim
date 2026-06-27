"""
World Aquatics Points Calculator.

Formula: Points = 1000 × (Base_Time / Swim_Time)³
Where times are in seconds.

Base times are updated annually based on World Records.
- SCM: validity 01.09.2025 – 31.08.2026
- LCM: validity 01.01.2026 – 31.12.2026
"""

# Base times in seconds: {event_name: {'M': seconds, 'F': seconds}}
# Event names match the normalized format used in the app

BASE_TIMES_SCM = {
    '50 M Freestyle':           {'M': 19.90,  'F': 22.83},
    '100 M Freestyle':          {'M': 44.84,  'F': 50.25},
    '200 M Freestyle':          {'M': 98.61,  'F': 110.31},
    '400 M Freestyle':          {'M': 212.25, 'F': 230.25},
    '800 M Freestyle':          {'M': 440.46, 'F': 477.42},
    '1500 M Freestyle':         {'M': 846.88, 'F': 908.24},
    '50 M Backstroke':          {'M': 22.11,  'F': 25.23},
    '100 M Backstroke':         {'M': 48.33,  'F': 54.02},
    '200 M Backstroke':         {'M': 105.63, 'F': 118.04},
    '50 M Breaststroke':        {'M': 24.95,  'F': 28.37},
    '100 M Breaststroke':       {'M': 55.28,  'F': 62.36},
    '200 M Breaststroke':       {'M': 120.16, 'F': 132.50},
    '50 M Butterfly':           {'M': 21.32,  'F': 23.94},
    '100 M Butterfly':          {'M': 47.71,  'F': 52.71},
    '200 M Butterfly':          {'M': 106.85, 'F': 119.32},
    '100 M Individual Medley':  {'M': 49.28,  'F': 55.11},
    '200 M Individual Medley':  {'M': 108.88, 'F': 121.63},
    '400 M Individual Medley':  {'M': 234.81, 'F': 255.48},
    # Relays
    '4x50 M Freestyle Relay':   {'M': 81.80,  'F': 92.50,  'X': 87.33},
    '4x100 M Freestyle Relay':  {'M': 181.66, 'F': 205.01},
    '4x200 M Freestyle Relay':  {'M': 400.51, 'F': 450.13},
    '4x50 M Medley Relay':      {'M': 89.72,  'F': 102.35, 'X': 95.15},
    '4x100 M Medley Relay':     {'M': 198.68, 'F': 220.41},
}

BASE_TIMES_LCM = {
    '50 M Freestyle':           {'M': 20.91,  'F': 23.61},
    '100 M Freestyle':          {'M': 46.40,  'F': 51.71},
    '200 M Freestyle':          {'M': 102.00, 'F': 112.23},
    '400 M Freestyle':          {'M': 219.96, 'F': 234.18},
    '800 M Freestyle':          {'M': 452.12, 'F': 484.12},
    '1500 M Freestyle':         {'M': 870.67, 'F': 920.48},
    '50 M Backstroke':          {'M': 23.55,  'F': 26.86},
    '100 M Backstroke':         {'M': 51.60,  'F': 57.13},
    '200 M Backstroke':         {'M': 111.92, 'F': 123.14},
    '50 M Breaststroke':        {'M': 25.95,  'F': 29.16},
    '100 M Breaststroke':       {'M': 56.88,  'F': 64.13},
    '200 M Breaststroke':       {'M': 125.48, 'F': 137.55},
    '50 M Butterfly':           {'M': 22.27,  'F': 24.43},
    '100 M Butterfly':          {'M': 49.45,  'F': 54.60},
    '200 M Butterfly':          {'M': 110.34, 'F': 121.81},
    '200 M Individual Medley':  {'M': 112.69, 'F': 125.70},
    '400 M Individual Medley':  {'M': 242.50, 'F': 263.65},
    # Relays
    '4x100 M Freestyle Relay':  {'M': 188.24, 'F': 207.96, 'X': 198.48},
    '4x200 M Freestyle Relay':  {'M': 418.55, 'F': 457.50},
    '4x100 M Medley Relay':     {'M': 206.78, 'F': 229.34, 'X': 217.43},
}


def _normalize_event_for_lookup(event_name):
    """Normalize event name to match base times keys.
    Handles variations like '200 M IM' → '200 M Individual Medley',
    relay gender suffixes like '4x100 M Freestyle Relay Men' → '4x100 M Freestyle Relay'.
    """
    import re
    name = event_name.strip()

    # Remove gender suffixes from relay names
    name = re.sub(r'\s+(Men|Women|Mixed)$', '', name, flags=re.IGNORECASE)

    # Normalize IM → Individual Medley
    name = re.sub(r'\bIM\b', 'Individual Medley', name)

    return name


def calculate_points(time_centiseconds, event_name, gender, pool):
    """
    Calculate World Aquatics points for a swim.

    Args:
        time_centiseconds: swim time in centiseconds (e.g. 2190 = 21.90s)
        event_name: normalized event name (e.g. '50 M Freestyle')
        gender: 'M', 'F', or 'X' (mixed relay)
        pool: 'LCM' or 'SCM'

    Returns:
        int: points (truncated to integer), or 0 if base time not found
    """
    if not time_centiseconds or time_centiseconds <= 0:
        return 0

    base_times = BASE_TIMES_LCM if pool == 'LCM' else BASE_TIMES_SCM
    lookup_name = _normalize_event_for_lookup(event_name)

    event_bases = base_times.get(lookup_name)
    if not event_bases:
        return 0

    # Get base time for gender, fallback to M if X not available
    base_time = event_bases.get(gender)
    if base_time is None and gender == 'X':
        base_time = event_bases.get('M')
    if base_time is None:
        return 0

    # Convert centiseconds to seconds
    swim_time = time_centiseconds / 100.0

    if swim_time <= 0:
        return 0

    # Formula: Points = 1000 × (Base_Time / Swim_Time)³
    points = 1000.0 * (base_time / swim_time) ** 3

    return int(points)  # truncate to integer
