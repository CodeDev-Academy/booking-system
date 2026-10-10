"""
Management command to run the 60-second expiry sweeper.
Usage: python manage.py run_expiry_sweep
"""

from django.core.management.base import BaseCommand
from appointments.services.sweep_service import SweepService


class Command(BaseCommand):
    help = 'Sweeps expired 60-minute slot offers and 15-minute temporary holds.'

    def handle(self, *args, **options):
        sweeper = SweepService()
        result = sweeper.sweep_all(actor="Management Command Sweeper")

        self.stdout.write(self.style.SUCCESS(
            f"Sweep completed at {result['timestamp']}: "
            f"{result['expired_offers_count']} offers expired, "
            f"{result['expired_holds_count']} holds released."
        ))
