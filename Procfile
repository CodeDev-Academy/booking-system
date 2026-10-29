web: cd backend && python manage.py migrate && python manage.py seed_clinic && python manage.py collectstatic --noinput && gunicorn core.wsgi:application --bind 0.0.0.0:$PORT --workers 1 --threads 8
