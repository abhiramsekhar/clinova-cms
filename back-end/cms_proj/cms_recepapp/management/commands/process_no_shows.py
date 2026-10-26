import time

from django.core.management.base import BaseCommand, CommandError
from django.db import close_old_connections

from cms_recepapp.services import mark_expired_scheduled_appointments


class Command(BaseCommand):
    help = "Mark scheduled prior bookings No-show after their arrival grace period."

    def add_arguments(self, parser):
        parser.add_argument('--watch', action='store_true', help='Run continuously under a process supervisor.')
        parser.add_argument('--interval', type=int, default=5, help='Seconds between checks in watch mode.')

    def handle(self, *args, **options):
        if options['interval'] < 1:
            raise CommandError('Interval must be at least one second.')
        try:
            while True:
                close_old_connections()
                try:
                    count = mark_expired_scheduled_appointments()
                    if count:
                        self.stdout.write(f'Marked {count} appointment(s) No-show.')
                except Exception as exc:
                    if not options['watch']:
                        raise
                    self.stderr.write(f'No-show processing failed; retrying: {exc}')
                if not options['watch']:
                    return
                time.sleep(options['interval'])
        except KeyboardInterrupt:
            return
