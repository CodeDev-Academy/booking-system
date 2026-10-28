from django.core.management.base import BaseCommand
from appointments.services.sweep_service import SweepService


class Command(BaseCommand):
    help = 'Sweeps expired 60-minute candidate slot offers and 15-minute temporary holds.'

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("Running Expiry Sweeper..."))
        result = SweepService.run_sweep(performed_by="cli_sweep_command")
        self.stdout.write(self.style.SUCCESS(
            f"[OK] Sweep Completed: {result['expired_offers_count']} offers expired, "
            f"{result['expired_holds_count']} holds expired."
        ))
