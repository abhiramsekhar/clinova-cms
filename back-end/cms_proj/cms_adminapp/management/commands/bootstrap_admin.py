"""Create or explicitly reset one administrator account without demo seeding."""

from getpass import getpass

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from cms_backendapp.models import Role, Staff, User


class Command(BaseCommand):
    help = "Create an admin login, or reset its password with --reset-password."

    def add_arguments(self, parser):
        parser.add_argument("--username", default="admin")
        parser.add_argument("--staff-name", default="Clinic Administrator")
        parser.add_argument(
            "--reset-password",
            action="store_true",
            help="Explicitly replace the password if this username already exists.",
        )

    def handle(self, *args, **options):
        username = options["username"].strip()
        if not username:
            raise CommandError("Username cannot be empty.")

        existing = User.objects.select_related("role", "staff").filter(username=username).first()
        if existing and existing.role_id != "ADMIN":
            raise CommandError("That username already belongs to a non-admin account; no changes were made.")

        password = getpass("Admin password (at least 8 characters): ")
        confirmation = getpass("Confirm admin password: ")
        if len(password) < 8:
            raise CommandError("Password must contain at least 8 characters.")
        if password != confirmation:
            raise CommandError("Passwords did not match.")

        if existing and not options["reset_password"]:
            if existing.check_password(password):
                self.stdout.write(self.style.SUCCESS(f"Admin account '{username}' is ready."))
                return
            raise CommandError(
                "An admin account with this username already exists. "
                "Run again with --reset-password to replace its password."
            )

        with transaction.atomic():
            role, _ = Role.objects.get_or_create(
                role_id="ADMIN",
                defaults={"role_name": "Administrator", "description": "System administrator"},
            )

            if existing:
                if not existing.is_active or not existing.staff.is_active:
                    raise CommandError("This admin or staff account is inactive; activate it through your normal admin process.")
                existing.set_password(password)
                existing.failed_attempts = 0
                existing.locked_until = None
                existing.save(update_fields=["password_hash", "failed_attempts", "locked_until"])
                action = "reset"
            else:
                staff = Staff.objects.create(
                    name=options["staff_name"].strip() or "Clinic Administrator",
                    designation="System Administrator",
                    role=role,
                    is_active=True,
                )
                account = User(staff=staff, username=username, role=role, is_active=True)
                account.set_password(password)
                account.save()
                action = "created"

        self.stdout.write(self.style.SUCCESS(f"Admin account '{username}' {action} successfully."))
