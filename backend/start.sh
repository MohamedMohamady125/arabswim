#!/bin/bash
# Drop all tables and start fresh (safe for new deployment)
python manage.py shell -c "
from django.db import connection
with connection.cursor() as cursor:
    cursor.execute('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
print('Database reset complete')
" 2>/dev/null || true
python manage.py migrate --noinput
python manage.py collectstatic --noinput
python manage.py seed_countries
python manage.py seed_events
python manage.py seed_classifications
python manage.py fix_names

# Create admin user if not exists
python manage.py shell -c "
from core.models import User
if not User.objects.filter(username='admin').exists():
    User.objects.create_superuser('admin', 'admin@arabswim.com', 'admin123')
    print('Admin user created')
else:
    print('Admin user exists')
"

gunicorn arabswim.wsgi --bind 0.0.0.0:$PORT
