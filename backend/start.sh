#!/bin/bash
python manage.py migrate --noinput
python manage.py collectstatic --noinput
python manage.py seed_countries
python manage.py seed_events
python manage.py seed_classifications
python manage.py fix_names
python manage.py fix_relay_event_names
python manage.py split_merged_swimmers
python manage.py strip_team_numbers
python manage.py mark_relay_teams
python manage.py recalculate_medals

# Create admin user if not exists (password comes from the ADMIN_PASSWORD
# env var — never hardcode credentials in the repo)
python manage.py shell -c "
import os
from core.models import User
password = os.environ.get('ADMIN_PASSWORD')
if not User.objects.filter(username='admin').exists():
    if password:
        User.objects.create_superuser('admin', 'admin@arabswim.com', password)
        print('Admin user created')
    else:
        print('ADMIN_PASSWORD not set; skipping admin creation')
else:
    print('Admin user exists')
"

gunicorn arabswim.wsgi --bind 0.0.0.0:$PORT --timeout 300
