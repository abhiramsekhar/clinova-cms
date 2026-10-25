"""
cms_backendapp/management/commands/seed_demo.py
Seeds full demo database mirroring front-end/frontend/data/seed.js.
Supports --reset to clear only project app tables before seeding.
"""

from datetime import datetime, time, timedelta
from decimal import Decimal

from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand
from django.db import connection, transaction
from django.db.models import Sum
from django.utils import timezone

from cms_backendapp.models import (
    AuditLog,
    Department,
    IdSequence,
    LabTestCatalog,
    Notification,
    Role,
    Setting,
    Staff,
    User,
)
from cms_doctorapp.models import (
    ConsultationRecord,
    Doctor,
    LabTest,
    Prescription,
    PrescriptionItem,
)
from cms_labapp.models import LabTestResult
from cms_pharmapp.models import (
    Medicine,
    PurchaseOrder,
    StockLedgerEntry,
    Supplier,
)
from cms_recepapp.models import (
    Appointment,
    Bill,
    BillItem,
    Patient,
    Payment,
)


class Command(BaseCommand):
    help = "Seed demo database with entities from frontend seed.js. Use --reset to re-seed."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Clear all project app tables before loading seed data.",
        )

    def handle(self, *args, **options):
        reset_mode = options.get("reset", False)

        if reset_mode:
            self.stdout.write(self.style.WARNING("Resetting project application tables..."))
            self.clear_project_tables()
            self.stdout.write(self.style.SUCCESS("Project tables cleared."))

        self.stdout.write("Loading seed data...")
        self.load_all_seed_data()
        self.print_demo_logins()

    def clear_project_tables(self):
        """
        Clears ONLY the project's own application tables.
        NEVER touches auth_*, django_*, or third-party tables.
        """
        app_tables = [
            "lab_test_results",
            "lab_tests",
            "prescription_items",
            "prescriptions",
            "consultation_records",
            "payments",
            "bill_items",
            "bills",
            "appointments",
            "patients",
            "stock_ledger",
            "purchase_orders",
            "suppliers",
            "medicines",
            "doctors",
            "notifications",
            "audit_log",
            "settings",
            "users",
            "staff",
            "lab_test_catalog",
            "departments",
            "roles",
            "id_sequences",
        ]

        with connection.cursor() as cursor:
            cursor.execute("SET FOREIGN_KEY_CHECKS = 0;")
            for table in app_tables:
                cursor.execute(f"TRUNCATE TABLE `{table}`;")
            cursor.execute("SET FOREIGN_KEY_CHECKS = 1;")

    @transaction.atomic
    def load_all_seed_data(self):
        today = timezone.localdate()

        def d(offset):
            return today + timedelta(days=offset)

        def dt_iso(offset, h=9, m=0):
            d_target = today + timedelta(days=offset)
            t_target = time(hour=h, minute=m, second=0)
            combined = datetime.combine(d_target, t_target)
            return timezone.make_aware(combined)

        def to_dec(paise_val):
            if paise_val is None:
                return Decimal("0.00")
            return (Decimal(str(paise_val)) / Decimal("100")).quantize(Decimal("0.01"))

        # 1. ROLES
        roles_data = [
            ("ADMIN", "Administrator", "Full system administrator"),
            ("DOCTOR", "Doctor", "Medical practitioner"),
            ("RECEPTIONIST", "Receptionist", "Front desk receptionist"),
            ("PHARMACIST", "Pharmacist", "Pharmacy operator"),
            ("LAB_TECH", "Lab Technician", "Laboratory technician"),
        ]
        for role_id, name, desc in roles_data:
            Role.objects.get_or_create(
                role_id=role_id,
                defaults={"role_name": name, "description": desc},
            )

        # 2. DEPARTMENTS
        depts_def = [
            ("dept-01", "General Medicine", "GM", 50000),
            ("dept-02", "Paediatrics", "PED", 60000),
            ("dept-03", "Dermatology", "DER", 70000),
            ("dept-04", "Orthopaedics", "ORT", 80000),
            ("dept-05", "ENT", "ENT", 65000),
            ("dept-06", "Gynaecology", "GYN", 75000),
        ]
        for did, name, code, fee in depts_def:
            Department.objects.get_or_create(
                department_id=did,
                defaults={
                    "name": name,
                    "code": code,
                    "default_fee": to_dec(fee),
                    "is_bookable": True,
                    "is_active": True,
                },
            )

        # 3. STAFF
        staff_data = [
            # Admin
            ("staff-admin-01", "Rajesh Kumar", "System Administrator", None, "ADMIN", "+91-9876543210", "rajesh@clinova.in", "../../assets/images/staff/admin-rajesh.svg", True, -365),
            # Doctors
            ("staff-doc-01", "Dr. Sarah Thomas", "Senior Physician", "dept-01", "DOCTOR", "+91-9845123456", "sarah@clinova.in", "../../assets/images/staff/dr-sarah-thomas.svg", True, -300),
            ("staff-doc-02", "Dr. Priya Nambiar", "Paediatrician", "dept-02", "DOCTOR", "+91-9845234567", "priya@clinova.in", "../../assets/images/staff/dr-priya-nambiar.svg", True, -280),
            ("staff-doc-03", "Dr. Anil Kumar", "Dermatologist", "dept-03", "DOCTOR", "+91-9845345678", "anil@clinova.in", "../../assets/images/staff/dr-anil-kumar.svg", True, -260),
            ("staff-doc-04", "Dr. Meera Krishnan", "Orthopaedic Surgeon", "dept-04", "DOCTOR", "+91-9845456789", "meera@clinova.in", "../../assets/images/staff/dr-meera-krishnan.svg", True, -240),
            ("staff-doc-05", "Dr. Faisal Rahman", "ENT Specialist", "dept-05", "DOCTOR", "+91-9845567890", "faisal@clinova.in", "../../assets/images/staff/dr-faisal-rahman.svg", True, -220),
            ("staff-doc-06", "Dr. Sreelakshmi Nair", "Gynaecologist", "dept-06", "DOCTOR", "+91-9845678901", "sreelakshmi@clinova.in", "../../assets/images/staff/dr-sreelakshmi-nair.svg", True, -200),
            # Receptionists
            ("staff-rec-01", "Anjali Menon", "Senior Receptionist", None, "RECEPTIONIST", "+91-9846123456", "anjali@clinova.in", "../../assets/images/staff/reception-anjali.svg", True, -350),
            ("staff-rec-02", "Deepa Vijayan", "Receptionist", None, "RECEPTIONIST", "+91-9846234567", "deepa@clinova.in", "../../assets/images/staff/reception-deepa.svg", True, -330),
            # Pharmacists
            ("staff-pharm-01", "Lakshmi Devi", "Chief Pharmacist", None, "PHARMACIST", "+91-9847123456", "lakshmi@clinova.in", "../../assets/images/staff/pharmacy-lakshmi.svg", True, -340),
            ("staff-pharm-02", "Vishnu Prasad", "Pharmacist", None, "PHARMACIST", "+91-9847234567", "vishnu@clinova.in", "../../assets/images/staff/pharmacy-vishnu.svg", True, -310),
            # Lab Technicians
            ("staff-lab-01", "Arjun Pillai", "Senior Lab Technician", None, "LAB_TECH", "+91-9848123456", "arjun@clinova.in", "../../assets/images/staff/lab-arjun.svg", True, -320),
            ("staff-lab-02", "Divya Suresh", "Lab Technician", None, "LAB_TECH", "+91-9848234567", "divya@clinova.in", "../../assets/images/staff/lab-divya.svg", True, -290),
            # Deactivated
            ("staff-deact-01", "Dr. Ramesh Babu", "Physician (Resigned)", "dept-01", "DOCTOR", "+91-9849999999", "ramesh@clinova.in", None, False, -500),
        ]

        for sid, name, desig, did, rid, phone, email, avatar, active, join_days in staff_data:
            dept = Department.objects.filter(pk=did).first() if did else None
            role = Role.objects.get(pk=rid)
            Staff.objects.get_or_create(
                staff_id=sid,
                defaults={
                    "name": name,
                    "designation": desig,
                    "department": dept,
                    "role": role,
                    "phone": phone,
                    "email": email,
                    "avatar_url": avatar,
                    "is_active": active,
                    "date_joined": d(join_days),
                },
            )

        # Link Department head doctors
        dept_heads = {
            "dept-01": "staff-doc-01",
            "dept-02": "staff-doc-02",
            "dept-03": "staff-doc-03",
            "dept-04": "staff-doc-04",
            "dept-05": "staff-doc-05",
            "dept-06": "staff-doc-06",
        }
        for did, h_sid in dept_heads.items():
            stf = Staff.objects.filter(pk=h_sid).first()
            if stf:
                Department.objects.filter(pk=did).update(head_doctor=stf)

        # 4. DOCTORS (Staff <-> Doctor bridge)
        doc_staff_list = [s for s in staff_data if s[4] == "DOCTOR"]
        for idx, (sid, name, desig, did, _, _, _, _, active, _) in enumerate(doc_staff_list, 1):
            stf = Staff.objects.get(pk=sid)
            dept = Department.objects.filter(pk=did).first()
            doc_id = f"doc-{str(idx).zfill(2)}"
            Doctor.objects.get_or_create(
                staff=stf,
                defaults={
                    "doctor_id": doc_id,
                    "department": dept,
                    "specialization": desig,
                    "consultation_fee": dept.default_fee if dept else Decimal("500.00"),
                },
            )

        # 5. USERS
        users_def = [
            ("user-admin", "admin", "Admin@123", "ADMIN", "staff-admin-01", True),
            ("user-doc-01", "dr.sarah", "Doctor@123", "DOCTOR", "staff-doc-01", True),
            ("user-doc-02", "dr.priya", "Doctor@123", "DOCTOR", "staff-doc-02", True),
            ("user-doc-03", "dr.anil", "Doctor@123", "DOCTOR", "staff-doc-03", True),
            ("user-doc-04", "dr.meera", "Doctor@123", "DOCTOR", "staff-doc-04", True),
            ("user-doc-05", "dr.faisal", "Doctor@123", "DOCTOR", "staff-doc-05", True),
            ("user-doc-06", "dr.sreelakshmi", "Doctor@123", "DOCTOR", "staff-doc-06", True),
            ("user-rec-01", "reception1", "Reception@123", "RECEPTIONIST", "staff-rec-01", True),
            ("user-rec-02", "reception2", "Reception@123", "RECEPTIONIST", "staff-rec-02", True),
            ("user-pharm-01", "pharmacy1", "Pharmacy@123", "PHARMACIST", "staff-pharm-01", True),
            ("user-pharm-02", "pharmacy2", "Pharmacy@123", "PHARMACIST", "staff-pharm-02", True),
            ("user-lab-01", "lab1", "Lab@123", "LAB_TECH", "staff-lab-01", True),
            ("user-lab-02", "lab2", "Lab@123", "LAB_TECH", "staff-lab-02", True),
            ("user-deact-01", "dr.ramesh", "Doctor@123", "DOCTOR", "staff-deact-01", False),
        ]
        for uid, uname, pwd, rid, sid, active in users_def:
            stf = Staff.objects.get(pk=sid)
            role = Role.objects.get(pk=rid)
            User.objects.get_or_create(
                user_id=uid,
                defaults={
                    "username": uname,
                    "password_hash": make_password(pwd),
                    "role": role,
                    "staff": stf,
                    "is_active": active,
                    "failed_attempts": 0,
                },
            )

        # 6. PATIENTS (24)
        patients_def = [
            ("pat-01", "CLN-2025-0001", "Arun Nair", "1985-03-14", "Male", "+91-9800100001", "arun.nair@email.com", "12 MG Road, Kochi", "O+", ["Penicillin"], None, None, ["Hypertension"], True),
            ("pat-02", "CLN-2025-0002", "Sneha Pillai", "1992-07-22", "Female", "+91-9800100002", "sneha.pillai@email.com", "45 Marine Drive, Kochi", "A+", [], None, None, [], True),
            ("pat-03", "CLN-2025-0003", "Mohammed Rashid", "1978-11-05", "Male", "+91-9800100003", None, "78 Calicut Rd, Malappuram", "B+", [], None, None, ["Type 2 Diabetes"], True),
            ("pat-04", "CLN-2025-0004", "Lakshmi Subramaniam", "1965-01-30", "Female", "+91-9800100004", "lakshmi.s@email.com", "23 Temple St, Thrissur", "AB+", [], None, None, ["Hypothyroidism", "Osteoarthritis"], True),
            ("pat-05", "CLN-2025-0005", "Vishnu Prakash", "1990-09-18", "Male", "+91-9800100005", "vishnu.p@email.com", "56 NH 66, Kollam", "O-", [], None, None, [], True),
            ("pat-06", "CLN-2025-0006", "Fatima Beevi", "1988-04-12", "Female", "+91-9800100006", None, "89 Court Rd, Trivandrum", "A-", [], None, None, ["Asthma"], True),
            ("pat-07", "CLN-2025-0007", "Rajan Varma", "1975-12-25", "Male", "+91-9800100007", "rajan.v@email.com", "34 Park Ave, Kochi", "B-", [], None, None, ["Hypertension"], True),
            ("pat-08", "CLN-2025-0008", "Gayathri Menon", "1995-06-08", "Female", "+91-9800100008", "gayathri.m@email.com", "67 Hill View, Munnar", "O+", [], None, None, [], True),
            ("pat-09", "CLN-2025-0009", "Suresh Babu", "1982-02-14", "Male", "+91-9800100009", None, "12 River Rd, Alappuzha", "A+", ["Sulpha drugs"], None, None, [], True),
            ("pat-10", "CLN-2025-0010", "Anitha Krishnan", "1998-10-20", "Female", "+91-9800100010", "anitha.k@email.com", "45 Beach Rd, Varkala", "AB-", [], None, None, [], True),
            ("pat-11", "CLN-2025-0011", "Biju Thomas", "1970-08-03", "Male", "+91-9800100011", "biju.t@email.com", "78 Church St, Kottayam", "O+", [], None, None, ["COPD"], True),
            ("pat-12", "CLN-2025-0012", "Nisha George", "1993-05-17", "Female", "+91-9800100012", None, "23 Sunset Lane, Kannur", "B+", [], None, None, [], True),
            ("pat-13", "CLN-2025-0013", "Prasad Namboodiri", "1968-09-11", "Male", "+91-9800100013", "prasad.n@email.com", "56 Agrahara, Palakkad", "A+", [], None, None, ["Type 2 Diabetes", "Hypertension"], True),
            ("pat-14", "CLN-2025-0014", "Reshma Fathima", "2000-01-25", "Female", "+91-9800100014", "reshma.f@email.com", "89 Market Rd, Kasaragod", "O-", [], None, None, [], True),
            ("pat-15", "CLN-2025-0015", "Jayan Mathew", "1987-11-30", "Male", "+91-9800100015", None, "34 Railway Colony, Shoranur", "B+", [], None, None, [], True),
            ("pat-16", "CLN-2025-0016", "Shalini Raj", "1996-03-09", "Female", "+91-9800100016", "shalini.r@email.com", "67 Lake Side, Kumarakom", "A-", [], None, None, [], True),
            ("pat-17", "CLN-2025-0017", "Vinod Kumar", "1980-07-14", "Male", "+91-9800100017", "vinod.k@email.com", "12 Fort Rd, Thiruvananthapuram", "AB+", [], None, None, ["Hypertension"], True),
            ("pat-18", "CLN-2025-0018", "Deepa Mohan", "1991-12-03", "Female", "+91-9800100018", None, "45 Greenfield, Thrissur", "O+", [], None, None, [], True),
            ("pat-19", "CLN-2025-0019", "Ramesh Kumar", "1973-04-28", "Male", "+91-9800100019", "ramesh.k@email.com", "78 Station Rd, Ernakulam", "B-", [], None, None, [], True),
            ("pat-20", "CLN-2025-0020", "Kavitha Nair", "1989-08-16", "Female", "+91-9800100020", "kavitha.n@email.com", "23 MG Road, Kochi", "A+", [], None, None, [], True),
            ("pat-21", "CLN-2025-0021", "Sreekanth R.", "1986-06-10", "Male", "+91-9800100021", None, "56 Old Town, Kozhikode", "O+", [], None, None, [], True),
            ("pat-22", "CLN-2025-0022", "Sreekanth Raghavan", "1986-06-10", "Male", "+91-9800100021", "sreekanth.r@email.com", "56 Old Town, Kozhikode", "O+", [], None, None, [], True),
            ("pat-23", "CLN-2025-0023", "Aditi Menon", str(d(-365 * 8)), "Female", "+91-9800100023", None, "89 School Rd, Kochi", "A+", [], "Pradeep Menon", "+91-9800100023", [], True),
            ("pat-24", "CLN-2025-0024", "Aryan Bhat", str(d(-365 * 5)), "Male", "+91-9800100024", None, "34 Green Valley, Palakkad", "B+", [], "Smitha Bhat", "+91-9800100024", [], True),
        ]
        for pid, mrn, name, dob, gender, phone, email, addr, bg, allergies, gname, gphone, chronic, active in patients_def:
            allergies_str = ", ".join(allergies) if isinstance(allergies, list) else str(allergies or "")
            Patient.objects.get_or_create(
                patient_id=pid,
                defaults={
                    "mrn": mrn,
                    "name": name,
                    "dob": dob,
                    "gender": gender,
                    "phone": phone,
                    "email": email,
                    "address": addr,
                    "blood_group": bg,
                    "allergies": allergies_str,
                    "guardian_name": gname,
                    "guardian_phone": gphone,
                    "chronic_conditions": chronic,
                    "is_active": active,
                    "registered_on": d(-120),
                },
            )

        # 7. APPOINTMENTS (45)
        appt_specs = [
            ("pat-01", "staff-doc-01", "dept-01", -14, "09:00", "Follow-up", "COMPLETED", 1, "Blood pressure review"),
            ("pat-02", "staff-doc-02", "dept-02", -14, "09:30", "New Visit", "COMPLETED", 2, "Child vaccination"),
            ("pat-03", "staff-doc-01", "dept-01", -13, "10:00", "Follow-up", "COMPLETED", 1, "Diabetes check-up"),
            ("pat-04", "staff-doc-04", "dept-04", -12, "09:00", "New Visit", "COMPLETED", 1, "Knee pain"),
            ("pat-05", "staff-doc-03", "dept-03", -11, "09:30", "New Visit", "COMPLETED", 1, "Skin rash"),
            ("pat-06", "staff-doc-01", "dept-01", -10, "10:00", "Follow-up", "NO_SHOW", 2, "Asthma review"),
            ("pat-07", "staff-doc-01", "dept-01", -9, "09:00", "Follow-up", "COMPLETED", 1, "BP medication adjustment"),
            ("pat-08", "staff-doc-06", "dept-06", -8, "09:30", "New Visit", "COMPLETED", 1, "Annual check-up"),
            ("pat-09", "staff-doc-01", "dept-01", -7, "10:00", "New Visit", "CANCELLED", 2, "General consultation"),
            ("pat-10", "staff-doc-05", "dept-05", -7, "09:00", "New Visit", "COMPLETED", 1, "Ear pain"),
            ("pat-11", "staff-doc-01", "dept-01", -6, "09:30", "Follow-up", "COMPLETED", 1, "COPD management"),
            ("pat-12", "staff-doc-03", "dept-03", -5, "10:00", "New Visit", "COMPLETED", 1, "Acne treatment"),
            ("pat-13", "staff-doc-01", "dept-01", -4, "09:00", "Follow-up", "COMPLETED", 1, "Diabetes review"),
            ("pat-14", "staff-doc-06", "dept-06", -3, "09:30", "New Visit", "COMPLETED", 1, "Routine check-up"),
            ("pat-15", "staff-doc-04", "dept-04", -3, "10:00", "New Visit", "COMPLETED", 2, "Back pain"),
            ("pat-16", "staff-doc-02", "dept-02", -2, "09:00", "Follow-up", "COMPLETED", 1, "Follow-up visit"),
            ("pat-17", "staff-doc-01", "dept-01", -2, "09:30", "Follow-up", "COMPLETED", 2, "Hypertension management"),
            ("pat-18", "staff-doc-05", "dept-05", -1, "10:00", "New Visit", "COMPLETED", 1, "Sinus issues"),
            ("pat-19", "staff-doc-01", "dept-01", -1, "09:00", "New Visit", "COMPLETED", 1, "General check-up"),
            ("pat-20", "staff-doc-03", "dept-03", -1, "09:30", "Follow-up", "COMPLETED", 2, "Eczema review"),
            # Today
            ("pat-01", "staff-doc-01", "dept-01", 0, "09:00", "Follow-up", "COMPLETED", 1, "BP follow-up"),
            ("pat-02", "staff-doc-02", "dept-02", 0, "09:30", "Follow-up", "IN_PROGRESS", 1, "Child fever"),
            ("pat-03", "staff-doc-01", "dept-01", 0, "10:00", "Follow-up", "CHECKED_IN", 2, "Sugar level check"),
            ("pat-04", "staff-doc-04", "dept-04", 0, "10:30", "Follow-up", "CHECKED_IN", 1, "Knee follow-up"),
            ("pat-05", "staff-doc-01", "dept-01", 0, "11:00", "New Visit", "SCHEDULED", 3, "Fever and cold"),
            ("pat-06", "staff-doc-05", "dept-05", 0, "11:30", "New Visit", "SCHEDULED", 1, "Throat infection"),
            ("pat-07", "staff-doc-01", "dept-01", 0, "14:00", "Follow-up", "SCHEDULED", 4, "Medication review"),
            ("pat-23", "staff-doc-02", "dept-02", 0, "14:30", "New Visit", "SCHEDULED", 2, "Child vaccination"),
            ("pat-11", "staff-doc-01", "dept-01", 0, "15:00", "Follow-up", "SCHEDULED", 5, "COPD review"),
            ("pat-24", "staff-doc-02", "dept-02", 0, "15:30", "New Visit", "SCHEDULED", 3, "Childhood immunisation"),
            # Future
            ("pat-08", "staff-doc-06", "dept-06", 1, "09:00", "Follow-up", "SCHEDULED", 1, "Post-procedure review"),
            ("pat-09", "staff-doc-01", "dept-01", 1, "09:30", "New Visit", "SCHEDULED", 1, "Health check-up"),
            ("pat-10", "staff-doc-05", "dept-05", 1, "10:00", "Follow-up", "SCHEDULED", 2, "Ear follow-up"),
            ("pat-12", "staff-doc-03", "dept-03", 2, "09:00", "Follow-up", "SCHEDULED", 1, "Acne follow-up"),
            ("pat-13", "staff-doc-01", "dept-01", 2, "09:30", "Follow-up", "SCHEDULED", 2, "HbA1c review"),
            ("pat-14", "staff-doc-06", "dept-06", 3, "09:00", "New Visit", "SCHEDULED", 1, "Regular screening"),
            ("pat-15", "staff-doc-04", "dept-04", 3, "09:30", "Follow-up", "SCHEDULED", 1, "Physiotherapy review"),
            ("pat-16", "staff-doc-02", "dept-02", 4, "09:00", "Follow-up", "SCHEDULED", 1, "Growth chart review"),
            ("pat-17", "staff-doc-01", "dept-01", 4, "09:30", "Follow-up", "SCHEDULED", 3, "Annual health check"),
            ("pat-18", "staff-doc-01", "dept-01", 5, "09:00", "New Visit", "SCHEDULED", 1, "Headache evaluation"),
            ("pat-19", "staff-doc-03", "dept-03", 5, "09:30", "New Visit", "SCHEDULED", 1, "Skin allergy"),
            ("pat-20", "staff-doc-01", "dept-01", 6, "09:00", "Follow-up", "SCHEDULED", 2, "Follow-up consultation"),
            ("pat-21", "staff-doc-05", "dept-05", 6, "09:30", "New Visit", "SCHEDULED", 1, "Hearing test"),
            ("pat-22", "staff-doc-01", "dept-01", 7, "09:00", "New Visit", "SCHEDULED", 3, "New patient consultation"),
            ("pat-01", "staff-doc-01", "dept-01", 7, "10:00", "Follow-up", "SCHEDULED", 4, "Quarterly review"),
        ]

        for i, (pid, did, dept_id, day, time_val, appt_type, stat, token, reason) in enumerate(appt_specs, 1):
            appt_id = f"appt-{str(i).zfill(3)}"
            patient = Patient.objects.get(pk=pid)
            doctor = Doctor.objects.get(staff__staff_id=did)
            department = Department.objects.get(pk=dept_id)
            Appointment.objects.get_or_create(
                appointment_id=appt_id,
                defaults={
                    "patient": patient,
                    "doctor": doctor,
                    "department": department,
                    "appointment_date": d(day),
                    "time_slot": time_val,
                    "appointment_type": appt_type,
                    "status": stat,
                    "token_number": token,
                    "reason": reason,
                },
            )

        # 8. CONSULTATIONS (for completed appointments)
        completed_appts = Appointment.objects.filter(status="COMPLETED").order_by("appointment_id")
        for i, appt in enumerate(completed_appts):
            c_suffix = appt.appointment_id.split("-")[1]
            consult_id = f"consult-{c_suffix}"
            vital_signs = {
                "bp": "120/80",
                "pulse": 72 + (i % 10),
                "temp": round(98.4 + (i % 3) * 0.2, 1),
                "spo2": 97 + (i % 3),
            }
            ConsultationRecord.objects.get_or_create(
                record_id=consult_id,
                defaults={
                    "appointment": appt,
                    "patient": appt.patient,
                    "doctor": appt.doctor,
                    "visit_date": appt.appointment_date,
                    "symptoms": appt.reason,
                    "diagnosis": "Clinical evaluation performed",
                    "notes": "Patient counselled. Follow-up advised as needed.",
                    "vital_signs": vital_signs,
                    "is_completed": True,
                },
            )

        # 9. MEDICINES (28)
        medicines_def = [
            ("med-01", "Paracetamol 500mg", "Paracetamol", "Analgesic", "Tablet", "500mg", "Cipla", 150, [{"batchNo": "B2025A01", "expiryDate": str(d(180)), "quantity": 500, "receivedDate": str(d(-60))}], 100),
            ("med-02", "Amoxicillin 500mg", "Amoxicillin", "Antibiotic", "Capsule", "500mg", "Sun Pharma", 800, [{"batchNo": "B2025A02", "expiryDate": str(d(365)), "quantity": 300, "receivedDate": str(d(-45))}], 50),
            ("med-03", "Azithromycin 250mg", "Azithromycin", "Antibiotic", "Tablet", "250mg", "Zydus", 1200, [{"batchNo": "B2025A03", "expiryDate": str(d(270)), "quantity": 200, "receivedDate": str(d(-30))}], 40),
            ("med-04", "Metformin 500mg", "Metformin", "Antidiabetic", "Tablet", "500mg", "USV", 250, [{"batchNo": "B2025A04", "expiryDate": str(d(300)), "quantity": 400, "receivedDate": str(d(-50))}], 80),
            ("med-05", "Amlodipine 5mg", "Amlodipine", "Antihypertensive", "Tablet", "5mg", "Cipla", 350, [{"batchNo": "B2025A05", "expiryDate": str(d(400)), "quantity": 350, "receivedDate": str(d(-40))}], 60),
            ("med-06", "Omeprazole 20mg", "Omeprazole", "Antacid", "Capsule", "20mg", "Dr. Reddys", 450, [{"batchNo": "B2025A06", "expiryDate": str(d(250)), "quantity": 280, "receivedDate": str(d(-35))}], 50),
            ("med-07", "Cetirizine 10mg", "Cetirizine", "Antihistamine", "Tablet", "10mg", "Sun Pharma", 200, [{"batchNo": "B2025A07", "expiryDate": str(d(200)), "quantity": 400, "receivedDate": str(d(-55))}], 70),
            ("med-08", "Pantoprazole 40mg", "Pantoprazole", "Antacid", "Tablet", "40mg", "Alkem", 600, [{"batchNo": "B2025A08", "expiryDate": str(d(320)), "quantity": 200, "receivedDate": str(d(-25))}], 40),
            ("med-09", "Atorvastatin 10mg", "Atorvastatin", "Statin", "Tablet", "10mg", "Cipla", 500, [{"batchNo": "B2025A09", "expiryDate": str(d(280)), "quantity": 250, "receivedDate": str(d(-30))}], 50),
            ("med-10", "Losartan 50mg", "Losartan", "Antihypertensive", "Tablet", "50mg", "Torrent", 400, [{"batchNo": "B2025A10", "expiryDate": str(d(350)), "quantity": 300, "receivedDate": str(d(-20))}], 60),
            ("med-11", "Metoprolol 25mg", "Metoprolol", "Beta-blocker", "Tablet", "25mg", "Intas", 300, [{"batchNo": "B2025A11", "expiryDate": str(d(290)), "quantity": 200, "receivedDate": str(d(-40))}], 40),
            ("med-12", "Ibuprofen 400mg", "Ibuprofen", "NSAID", "Tablet", "400mg", "Cipla", 180, [{"batchNo": "B2025A12", "expiryDate": str(d(220)), "quantity": 350, "receivedDate": str(d(-45))}], 60),
            ("med-13", "Levothyroxine 50mcg", "Levothyroxine", "Thyroid", "Tablet", "50mcg", "Abbott", 280, [{"batchNo": "B2025A13", "expiryDate": str(d(400)), "quantity": 300, "receivedDate": str(d(-25))}], 50),
            ("med-14", "Prednisolone 5mg", "Prednisolone", "Corticosteroid", "Tablet", "5mg", "Wyeth", 350, [{"batchNo": "B2025A14", "expiryDate": str(d(260)), "quantity": 150, "receivedDate": str(d(-35))}], 30),
            ("med-15", "Salbutamol Inhaler", "Salbutamol", "Bronchodilator", "Inhaler", "100mcg", "Cipla", 15000, [{"batchNo": "B2025A15", "expiryDate": str(d(300)), "quantity": 60, "receivedDate": str(d(-20))}], 15),
            ("med-16", "Ranitidine 150mg", "Ranitidine", "Antacid", "Tablet", "150mg", "Cadila", 220, [{"batchNo": "B2025A16", "expiryDate": str(d(180)), "quantity": 250, "receivedDate": str(d(-50))}], 40),
            ("med-17", "Doxycycline 100mg", "Doxycycline", "Antibiotic", "Capsule", "100mg", "Leeford", 900, [{"batchNo": "B2025A17", "expiryDate": str(d(310)), "quantity": 180, "receivedDate": str(d(-30))}], 30),
            ("med-18", "Montelukast 10mg", "Montelukast", "Anti-asthmatic", "Tablet", "10mg", "Sun Pharma", 700, [{"batchNo": "B2025A18", "expiryDate": str(d(270)), "quantity": 200, "receivedDate": str(d(-25))}], 40),
            ("med-19", "Clindamycin 300mg", "Clindamycin", "Antibiotic", "Capsule", "300mg", "Alkem", 1500, [{"batchNo": "B2025A19", "expiryDate": str(d(350)), "quantity": 120, "receivedDate": str(d(-15))}], 25),
            ("med-20", "Diclofenac Gel 30g", "Diclofenac", "NSAID", "Gel", "1%", "Novartis", 12000, [{"batchNo": "B2025A20", "expiryDate": str(d(200)), "quantity": 80, "receivedDate": str(d(-40))}], 20),
            ("med-21", "Vitamin D3 60000IU", "Cholecalciferol", "Supplement", "Capsule", "60000IU", "Mankind", 3500, [{"batchNo": "B2025A21", "expiryDate": str(d(500)), "quantity": 400, "receivedDate": str(d(-10))}], 50),
            ("med-22", "Clopidogrel 75mg", "Clopidogrel", "Antiplatelet", "Tablet", "75mg", "Torrent", 600, [{"batchNo": "B2025A22", "expiryDate": str(d(280)), "quantity": 200, "receivedDate": str(d(-30))}], 40),
            ("med-23", "Fluconazole 150mg", "Fluconazole", "Antifungal", "Tablet", "150mg", "Glenmark", 1100, [{"batchNo": "B2025A23", "expiryDate": str(d(260)), "quantity": 100, "receivedDate": str(d(-20))}], 20),
            ("med-24", "Calcium + Vit D3", "Calcium Carbonate", "Supplement", "Tablet", "500mg", "Abbott", 400, [{"batchNo": "B2025A24", "expiryDate": str(d(400)), "quantity": 500, "receivedDate": str(d(-15))}], 80),
            ("med-25", "Domperidone 10mg", "Domperidone", "Antiemetic", "Tablet", "10mg", "Dr. Reddys", 250, [{"batchNo": "B2025A25", "expiryDate": str(d(230)), "quantity": 300, "receivedDate": str(d(-35))}], 50),
            ("med-26", "Ceftriaxone 1g Inj", "Ceftriaxone", "Antibiotic", "Injection", "1g", "Lupin", 8500, [{"batchNo": "B2025A26", "expiryDate": str(d(180)), "quantity": 0, "receivedDate": str(d(-60))}], 10),
            ("med-27", "Amoxiclav 625mg", "Amoxicillin+Clavulanic", "Antibiotic", "Tablet", "625mg", "GSK", 1800, [{"batchNo": "B2024X01", "expiryDate": str(d(-30)), "quantity": 45, "receivedDate": str(d(-180))}], 20),
            ("med-28", "Metformin XR 1000mg", "Metformin", "Antidiabetic", "Tablet", "1000mg", "USV", 450, [{"batchNo": "B2025F01", "expiryDate": str(d(90)), "quantity": 80, "receivedDate": str(d(-90))}, {"batchNo": "B2025F02", "expiryDate": str(d(300)), "quantity": 200, "receivedDate": str(d(-15))}], 50),
        ]

        for mid, name, generic, cat, form, strength, mfr, price, batches, reorder in medicines_def:
            total_qty = sum(b.get("quantity", 0) for b in batches)
            exp_date = batches[0]["expiryDate"] if batches else None
            Medicine.objects.get_or_create(
                medicine_id=mid,
                defaults={
                    "name": name,
                    "generic_name": generic,
                    "category": cat,
                    "form": form,
                    "strength": strength,
                    "manufacturer": mfr,
                    "selling_price": to_dec(price),
                    "cost_price": to_dec(int(price * 0.7)),
                    "batches": batches,
                    "stock_quantity": total_qty,
                    "reorder_threshold": reorder,
                    "expiry_date": exp_date,
                    "is_active": True,
                },
            )

        # 10. PRESCRIPTIONS & PRESCRIPTION ITEMS (26)
        rx_specs = [
            ("consult-001", "pat-01", "staff-doc-01", [{"medicineId": "med-05", "dosage": "1 tablet", "frequency": "Once daily", "duration": "30 days", "quantity": 30}], "DISPENSED", "staff-pharm-01", -14),
            ("consult-002", "pat-02", "staff-doc-02", [{"medicineId": "med-01", "dosage": "5ml syrup", "frequency": "TID", "duration": "5 days", "quantity": 1}], "DISPENSED", "staff-pharm-01", -14),
            ("consult-003", "pat-03", "staff-doc-01", [{"medicineId": "med-04", "dosage": "1 tablet", "frequency": "BD", "duration": "30 days", "quantity": 60}], "DISPENSED", "staff-pharm-02", -13),
            ("consult-004", "pat-04", "staff-doc-04", [{"medicineId": "med-12", "dosage": "1 tablet", "frequency": "TID", "duration": "7 days", "quantity": 21}, {"medicineId": "med-20", "dosage": "Apply locally", "frequency": "BD", "duration": "14 days", "quantity": 1}], "DISPENSED", "staff-pharm-01", -12),
            ("consult-005", "pat-05", "staff-doc-03", [{"medicineId": "med-07", "dosage": "1 tablet", "frequency": "Once daily", "duration": "10 days", "quantity": 10}, {"medicineId": "med-14", "dosage": "1 tablet", "frequency": "BD", "duration": "5 days", "quantity": 10}], "DISPENSED", "staff-pharm-02", -11),
            ("consult-007", "pat-07", "staff-doc-01", [{"medicineId": "med-10", "dosage": "1 tablet", "frequency": "Once daily", "duration": "30 days", "quantity": 30}], "DISPENSED", "staff-pharm-01", -9),
            ("consult-008", "pat-08", "staff-doc-06", [{"medicineId": "med-24", "dosage": "1 tablet", "frequency": "Once daily", "duration": "30 days", "quantity": 30}], "DISPENSED", "staff-pharm-01", -8),
            ("consult-010", "pat-10", "staff-doc-05", [{"medicineId": "med-02", "dosage": "1 capsule", "frequency": "TID", "duration": "7 days", "quantity": 21}, {"medicineId": "med-01", "dosage": "1 tablet", "frequency": "TID", "duration": "5 days", "quantity": 15}], "DISPENSED", "staff-pharm-02", -7),
            ("consult-011", "pat-11", "staff-doc-01", [{"medicineId": "med-15", "dosage": "2 puffs", "frequency": "PRN", "duration": "30 days", "quantity": 1}, {"medicineId": "med-18", "dosage": "1 tablet", "frequency": "Once daily", "duration": "30 days", "quantity": 30}], "DISPENSED", "staff-pharm-01", -6),
            ("consult-012", "pat-12", "staff-doc-03", [{"medicineId": "med-17", "dosage": "1 capsule", "frequency": "BD", "duration": "14 days", "quantity": 28}], "DISPENSED", "staff-pharm-02", -5),
            ("consult-013", "pat-13", "staff-doc-01", [{"medicineId": "med-04", "dosage": "1 tablet", "frequency": "BD", "duration": "30 days", "quantity": 60}, {"medicineId": "med-05", "dosage": "1 tablet", "frequency": "Once daily", "duration": "30 days", "quantity": 30}], "DISPENSED", "staff-pharm-01", -4),
            ("consult-014", "pat-14", "staff-doc-06", [{"medicineId": "med-21", "dosage": "1 capsule", "frequency": "Once weekly", "duration": "8 weeks", "quantity": 8}], "DISPENSED", "staff-pharm-02", -3),
            ("consult-015", "pat-15", "staff-doc-04", [{"medicineId": "med-12", "dosage": "1 tablet", "frequency": "BD", "duration": "10 days", "quantity": 20}], "DISPENSED", "staff-pharm-01", -3),
            ("consult-016", "pat-16", "staff-doc-02", [{"medicineId": "med-01", "dosage": "5ml", "frequency": "TID", "duration": "3 days", "quantity": 1}], "DISPENSED", "staff-pharm-02", -2),
            ("consult-017", "pat-17", "staff-doc-01", [{"medicineId": "med-05", "dosage": "1 tablet", "frequency": "Once daily", "duration": "30 days", "quantity": 30}, {"medicineId": "med-09", "dosage": "1 tablet", "frequency": "Once daily", "duration": "30 days", "quantity": 30}], "DISPENSED", "staff-pharm-01", -2),
            ("consult-018", "pat-18", "staff-doc-05", [{"medicineId": "med-03", "dosage": "1 tablet", "frequency": "Once daily", "duration": "3 days", "quantity": 3}, {"medicineId": "med-06", "dosage": "1 capsule", "frequency": "Once daily", "duration": "5 days", "quantity": 5}], "DISPENSED", "staff-pharm-02", -1),
            ("consult-019", "pat-19", "staff-doc-01", [{"medicineId": "med-01", "dosage": "1 tablet", "frequency": "TID", "duration": "5 days", "quantity": 15}], "DISPENSED", "staff-pharm-01", -1),
            ("consult-020", "pat-20", "staff-doc-03", [{"medicineId": "med-07", "dosage": "1 tablet", "frequency": "Once daily", "duration": "14 days", "quantity": 14}, {"medicineId": "med-14", "dosage": "1 tablet", "frequency": "Once daily", "duration": "7 days", "quantity": 7}], "DISPENSED", "staff-pharm-01", -1),
            ("consult-021", "pat-01", "staff-doc-01", [{"medicineId": "med-05", "dosage": "1 tablet", "frequency": "Once daily", "duration": "30 days", "quantity": 30}, {"medicineId": "med-11", "dosage": "1 tablet", "frequency": "BD", "duration": "30 days", "quantity": 60}], "PENDING", None, 0),
            ("consult-004", "pat-04", "staff-doc-04", [{"medicineId": "med-24", "dosage": "1 tablet", "frequency": "Once daily", "duration": "30 days", "quantity": 30}, {"medicineId": "med-12", "dosage": "1 tablet", "frequency": "BD", "duration": "7 days", "quantity": 14}], "PARTIALLY_DISPENSED", "staff-pharm-01", 0),
            ("consult-002", "pat-02", "staff-doc-02", [{"medicineId": "med-01", "dosage": "5ml syrup", "frequency": "TID", "duration": "3 days", "quantity": 1}], "PENDING", None, 0),
            ("consult-003", "pat-03", "staff-doc-01", [{"medicineId": "med-28", "dosage": "1 tablet", "frequency": "Once daily", "duration": "30 days", "quantity": 30}], "PENDING", None, 0),
            ("consult-005", "pat-05", "staff-doc-01", [{"medicineId": "med-02", "dosage": "1 capsule", "frequency": "TID", "duration": "5 days", "quantity": 15}], "CANCELLED", None, -7),
            ("consult-011", "pat-11", "staff-doc-01", [{"medicineId": "med-15", "dosage": "2 puffs", "frequency": "PRN", "duration": "30 days", "quantity": 1}], "PENDING", None, 0),
            ("consult-013", "pat-13", "staff-doc-01", [{"medicineId": "med-04", "dosage": "1 tablet", "frequency": "BD", "duration": "30 days", "quantity": 60}, {"medicineId": "med-22", "dosage": "1 tablet", "frequency": "Once daily", "duration": "30 days", "quantity": 30}], "PENDING", None, 0),
            ("consult-017", "pat-17", "staff-doc-01", [{"medicineId": "med-10", "dosage": "1 tablet", "frequency": "Once daily", "duration": "30 days", "quantity": 30}], "PENDING", None, 0),
        ]

        for i, (cid, pid, did, items, stat, disp_by, day) in enumerate(rx_specs, 1):
            rx_id = f"rx-{str(i).zfill(3)}"
            consult = ConsultationRecord.objects.filter(pk=cid).first()
            patient = Patient.objects.get(pk=pid)
            doctor = Doctor.objects.get(staff__staff_id=did)
            dispensed_staff = Staff.objects.filter(pk=disp_by).first() if disp_by else None

            rx, _ = Prescription.objects.get_or_create(
                prescription_id=rx_id,
                defaults={
                    "consultation": consult,
                    "patient": patient,
                    "doctor": doctor,
                    "appointment": consult.appointment if consult else None,
                    "date_issued": d(day),
                    "status": stat,
                    "dispensed_by": dispensed_staff,
                    "dispensed_at": dt_iso(day, 11) if dispensed_staff else None,
                },
            )

            for j, it in enumerate(items, 1):
                med = Medicine.objects.get(pk=it["medicineId"])
                dur_str = it.get("duration", "7 days")
                dur_days = 7
                try:
                    dur_days = int(dur_str.split()[0])
                except (ValueError, IndexError):
                    pass

                PrescriptionItem.objects.get_or_create(
                    item_id=f"{rx_id}-item-{j}",
                    defaults={
                        "prescription": rx,
                        "medicine": med,
                        "dosage": it.get("dosage", ""),
                        "frequency": it.get("frequency", ""),
                        "duration_days": dur_days,
                        "instructions": it.get("instructions", "As directed"),
                        "quantity": it.get("quantity", 1),
                    },
                )

        # 11. SUPPLIERS (4)
        suppliers_def = [
            ("sup-01", "Kerala Medical Supplies Pvt Ltd", "Sunil Mohan", "+91-484-2345678", "info@keralamedical.in", "Industrial Area, Kochi", ["med-01", "med-02", "med-03", "med-04", "med-05", "med-06", "med-07"]),
            ("sup-02", "MedPharma Distributors", "Ravi Shankar", "+91-471-2567890", "orders@medpharma.in", "Technopark Rd, Trivandrum", ["med-08", "med-09", "med-10", "med-11", "med-12", "med-13", "med-14"]),
            ("sup-03", "Aarogya Healthcare Solutions", "Prashant Nair", "+91-495-2789012", "sales@aarogya.in", "Mavoor Rd, Kozhikode", ["med-15", "med-16", "med-17", "med-18", "med-19", "med-20", "med-21"]),
            ("sup-04", "South India Pharma Corp", "Jayesh Varghese", "+91-487-2890123", "corp@sipharmacorp.in", "Round South, Thrissur", ["med-22", "med-23", "med-24", "med-25", "med-26", "med-27", "med-28"]),
        ]
        for sup_id, sname, cperson, sphone, semail, saddr, typical in suppliers_def:
            Supplier.objects.get_or_create(
                supplier_id=sup_id,
                defaults={
                    "name": sname,
                    "contact_person": cperson,
                    "phone": sphone,
                    "email": semail,
                    "address": saddr,
                    "typical_medicines": typical,
                    "is_active": True,
                },
            )

        # 12. PURCHASE ORDERS (6)
        pos_def = [
            ("po-001", "sup-01", [{"medicineId": "med-01", "name": "Paracetamol 500mg", "quantityOrdered": 500, "unitCost": 120, "quantityReceived": 500}, {"medicineId": "med-02", "name": "Amoxicillin 500mg", "quantityOrdered": 300, "unitCost": 650, "quantityReceived": 300}], "RECEIVED", 25500000, -60, -53, -55, "Regular monthly order", "staff-pharm-01"),
            ("po-002", "sup-02", [{"medicineId": "med-09", "name": "Atorvastatin 10mg", "quantityOrdered": 250, "unitCost": 400, "quantityReceived": 250}, {"medicineId": "med-10", "name": "Losartan 50mg", "quantityOrdered": 300, "unitCost": 320, "quantityReceived": 300}], "RECEIVED", 19600000, -45, -38, -40, None, "staff-pharm-01"),
            ("po-003", "sup-03", [{"medicineId": "med-15", "name": "Salbutamol Inhaler", "quantityOrdered": 60, "unitCost": 12000, "quantityReceived": 60}], "RECEIVED", 72000000, -30, -23, -25, "Urgent order", "staff-pharm-02"),
            ("po-004", "sup-04", [{"medicineId": "med-26", "name": "Ceftriaxone 1g Inj", "quantityOrdered": 50, "unitCost": 7000, "quantityReceived": 30}, {"medicineId": "med-24", "name": "Calcium + Vit D3", "quantityOrdered": 500, "unitCost": 320, "quantityReceived": 500}], "PARTIALLY_RECEIVED", 51000000, -15, -8, -10, "Ceftriaxone partial", "staff-pharm-01"),
            ("po-005", "sup-01", [{"medicineId": "med-03", "name": "Azithromycin 250mg", "quantityOrdered": 200, "unitCost": 950, "quantityReceived": 0}, {"medicineId": "med-07", "name": "Cetirizine 10mg", "quantityOrdered": 400, "unitCost": 160, "quantityReceived": 0}], "ORDERED", 25400000, -5, 2, None, None, "staff-pharm-02"),
            ("po-006", "sup-02", [{"medicineId": "med-11", "name": "Metoprolol 25mg", "quantityOrdered": 200, "unitCost": 240, "quantityReceived": 0}], "DRAFT", 4800000, 0, None, None, "Pending approval", "staff-pharm-01"),
        ]
        for poid, supid, items, stat, tot, oday, eday, rday, notes, staff_creator in pos_def:
            sup = Supplier.objects.get(pk=supid)
            creator = Staff.objects.filter(pk=staff_creator).first()
            PurchaseOrder.objects.get_or_create(
                order_id=poid,
                defaults={
                    "supplier": sup,
                    "status": stat,
                    "total_amount": to_dec(tot),
                    "order_date": d(oday),
                    "expected_date": d(eday) if eday else None,
                    "received_date": d(rday) if rday else None,
                    "notes": notes,
                    "items_data": items,
                    "created_by": creator,
                },
            )

        # 13. STOCK LEDGER (5)
        stock_specs = [
            ("sl-001", "med-01", "B2025A01", "PURCHASE", 500, "po-001", "PO received", "staff-pharm-01"),
            ("sl-002", "med-02", "B2025A02", "PURCHASE", 300, "po-001", "PO received", "staff-pharm-01"),
            ("sl-003", "med-01", "B2025A01", "DISPENSE", -15, "rx-002", "Dispensed", "staff-pharm-01"),
            ("sl-004", "med-05", "B2025A05", "DISPENSE", -30, "rx-001", "Dispensed", "staff-pharm-01"),
            ("sl-005", "med-04", "B2025A04", "DISPENSE", -60, "rx-003", "Dispensed", "staff-pharm-02"),
        ]
        for slid, mid, bno, stype, qty, refid, note, pby in stock_specs:
            med = Medicine.objects.get(pk=mid)
            performer = Staff.objects.filter(pk=pby).first()
            StockLedgerEntry.objects.get_or_create(
                entry_id=slid,
                defaults={
                    "medicine": med,
                    "batch_no": bno,
                    "entry_type": stype,
                    "quantity": qty,
                    "reference_id": refid,
                    "note": note,
                    "performed_by": performer,
                },
            )

        # 14. LAB CATALOG (12)
        lab_catalog_def = [
            ("test-01", "Complete Blood Count (CBC)", "CBC", "Haematology", "Blood (EDTA)", [{"name": "Haemoglobin", "unit": "g/dL", "refMin": 12, "refMax": 17, "criticalMin": 7, "criticalMax": 20}, {"name": "WBC Count", "unit": "×10³/µL", "refMin": 4, "refMax": 11, "criticalMin": 2, "criticalMax": 30}, {"name": "Platelet Count", "unit": "×10³/µL", "refMin": 150, "refMax": 400, "criticalMin": 50, "criticalMax": 1000}, {"name": "RBC Count", "unit": "×10⁶/µL", "refMin": 4.2, "refMax": 5.9, "criticalMin": 2.5, "criticalMax": 8}], 4, 35000),
            ("test-02", "Blood Glucose (Fasting)", "FBS", "Biochemistry", "Blood (Fluoride)", [{"name": "Fasting Blood Sugar", "unit": "mg/dL", "refMin": 70, "refMax": 100, "criticalMin": 40, "criticalMax": 400}], 2, 15000),
            ("test-03", "HbA1c", "HBA1C", "Biochemistry", "Blood (EDTA)", [{"name": "HbA1c", "unit": "%", "refMin": 4, "refMax": 5.6, "criticalMin": 2, "criticalMax": 14}], 6, 45000),
            ("test-04", "Lipid Profile", "LIPID", "Biochemistry", "Blood (Plain)", [{"name": "Total Cholesterol", "unit": "mg/dL", "refMin": 0, "refMax": 200, "criticalMin": 0, "criticalMax": 400}, {"name": "Triglycerides", "unit": "mg/dL", "refMin": 0, "refMax": 150, "criticalMin": 0, "criticalMax": 500}, {"name": "HDL", "unit": "mg/dL", "refMin": 40, "refMax": 60, "criticalMin": 10, "criticalMax": 100}, {"name": "LDL", "unit": "mg/dL", "refMin": 0, "refMax": 100, "criticalMin": 0, "criticalMax": 300}], 6, 55000),
            ("test-05", "Thyroid Profile (T3, T4, TSH)", "TFT", "Endocrinology", "Blood (Plain)", [{"name": "T3", "unit": "ng/dL", "refMin": 80, "refMax": 200, "criticalMin": 30, "criticalMax": 350}, {"name": "T4", "unit": "µg/dL", "refMin": 4.5, "refMax": 12, "criticalMin": 1, "criticalMax": 25}, {"name": "TSH", "unit": "mIU/L", "refMin": 0.4, "refMax": 4.0, "criticalMin": 0.1, "criticalMax": 40}], 8, 65000),
            ("test-06", "Liver Function Test (LFT)", "LFT", "Biochemistry", "Blood (Plain)", [{"name": "Total Bilirubin", "unit": "mg/dL", "refMin": 0.1, "refMax": 1.2, "criticalMin": 0, "criticalMax": 15}, {"name": "SGOT (AST)", "unit": "U/L", "refMin": 0, "refMax": 40, "criticalMin": 0, "criticalMax": 1000}, {"name": "SGPT (ALT)", "unit": "U/L", "refMin": 0, "refMax": 40, "criticalMin": 0, "criticalMax": 1000}, {"name": "Alkaline Phosphatase", "unit": "U/L", "refMin": 44, "refMax": 147, "criticalMin": 0, "criticalMax": 1000}], 6, 50000),
            ("test-07", "Kidney Function Test (KFT)", "KFT", "Biochemistry", "Blood (Plain)", [{"name": "Blood Urea", "unit": "mg/dL", "refMin": 15, "refMax": 40, "criticalMin": 1, "criticalMax": 100}, {"name": "Serum Creatinine", "unit": "mg/dL", "refMin": 0.6, "refMax": 1.2, "criticalMin": 0.1, "criticalMax": 10}, {"name": "Uric Acid", "unit": "mg/dL", "refMin": 3, "refMax": 7, "criticalMin": 1, "criticalMax": 20}], 6, 45000),
            ("test-08", "Urine Routine", "URINE", "Pathology", "Urine (Mid-stream)", [{"name": "pH", "unit": "", "refMin": 4.5, "refMax": 8, "criticalMin": 2, "criticalMax": 12}, {"name": "Protein", "unit": "", "refMin": None, "refMax": None, "criticalMin": None, "criticalMax": None, "referenceText": "Negative"}, {"name": "Glucose", "unit": "", "refMin": None, "refMax": None, "criticalMin": None, "criticalMax": None, "referenceText": "Negative"}, {"name": "RBC", "unit": "/HPF", "refMin": 0, "refMax": 2, "criticalMin": 0, "criticalMax": 50}, {"name": "WBC", "unit": "/HPF", "refMin": 0, "refMax": 5, "criticalMin": 0, "criticalMax": 100}], 3, 20000),
            ("test-09", "ESR", "ESR", "Haematology", "Blood (EDTA)", [{"name": "ESR (Westergren)", "unit": "mm/hr", "refMin": 0, "refMax": 20, "criticalMin": 0, "criticalMax": 100}], 2, 10000),
            ("test-10", "Blood Group & Rh Typing", "BG", "Haematology", "Blood (EDTA)", [{"name": "Blood Group", "unit": "", "refMin": None, "refMax": None, "criticalMin": None, "criticalMax": None, "referenceText": "A, B, AB, or O"}, {"name": "Rh Factor", "unit": "", "refMin": None, "refMax": None, "criticalMin": None, "criticalMax": None, "referenceText": "Positive or negative"}], 1, 15000),
            ("test-11", "Serum Electrolytes", "ELEC", "Biochemistry", "Blood (Plain)", [{"name": "Sodium", "unit": "mEq/L", "refMin": 136, "refMax": 145, "criticalMin": 120, "criticalMax": 160}, {"name": "Potassium", "unit": "mEq/L", "refMin": 3.5, "refMax": 5.0, "criticalMin": 2.5, "criticalMax": 6.5}, {"name": "Chloride", "unit": "mEq/L", "refMin": 98, "refMax": 106, "criticalMin": 80, "criticalMax": 120}], 4, 40000),
            ("test-12", "C-Reactive Protein (CRP)", "CRP", "Immunology", "Blood (Plain)", [{"name": "CRP", "unit": "mg/L", "refMin": 0, "refMax": 5, "criticalMin": 0, "criticalMax": 200}], 4, 35000),
        ]
        for tid, tname, code, cat, stype, params, thours, price in lab_catalog_def:
            params = [{**parameter, "rangeSource": "ILLUSTRATIVE_DEMO"} for parameter in params]
            LabTestCatalog.objects.get_or_create(
                test_catalog_id=tid,
                defaults={
                    "test_name": tname,
                    "code": code,
                    "category": cat,
                    "sample_type": stype,
                    "parameters": params,
                    "turnaround_hrs": thours,
                    "price": to_dec(price),
                    "is_active": True,
                },
            )

        # 15. LAB ORDERS & RESULTS (30)
        lab_orders_specs = [
            ("pat-01", "staff-doc-01", "test-01", "COMPLETED", "Routine", "staff-lab-01", -14, [{"parameter": "Haemoglobin", "value": "14.2", "unit": "g/dL", "flag": "normal"}, {"parameter": "WBC Count", "value": "7.5", "unit": "×10³/µL", "flag": "normal"}, {"parameter": "Platelet Count", "value": "250", "unit": "×10³/µL", "flag": "normal"}, {"parameter": "RBC Count", "value": "4.8", "unit": "×10⁶/µL", "flag": "normal"}], False),
            ("pat-03", "staff-doc-01", "test-02", "COMPLETED", "Routine", "staff-lab-01", -13, [{"parameter": "Fasting Blood Sugar", "value": "142", "unit": "mg/dL", "flag": "high"}], False),
            ("pat-03", "staff-doc-01", "test-03", "COMPLETED", "Routine", "staff-lab-02", -13, [{"parameter": "HbA1c", "value": "7.8", "unit": "%", "flag": "high"}], False),
            ("pat-04", "staff-doc-04", "test-09", "COMPLETED", "Routine", "staff-lab-01", -12, [{"parameter": "ESR (Westergren)", "value": "35", "unit": "mm/hr", "flag": "high"}], False),
            ("pat-07", "staff-doc-01", "test-04", "COMPLETED", "Routine", "staff-lab-02", -9, [{"parameter": "Total Cholesterol", "value": "245", "unit": "mg/dL", "flag": "high"}, {"parameter": "Triglycerides", "value": "180", "unit": "mg/dL", "flag": "high"}, {"parameter": "HDL", "value": "38", "unit": "mg/dL", "flag": "low"}, {"parameter": "LDL", "value": "142", "unit": "mg/dL", "flag": "high"}], False),
            ("pat-11", "staff-doc-01", "test-01", "COMPLETED", "Routine", "staff-lab-01", -6, [{"parameter": "Haemoglobin", "value": "13.5", "unit": "g/dL", "flag": "normal"}, {"parameter": "WBC Count", "value": "9.2", "unit": "×10³/µL", "flag": "normal"}, {"parameter": "Platelet Count", "value": "220", "unit": "×10³/µL", "flag": "normal"}, {"parameter": "RBC Count", "value": "4.5", "unit": "×10⁶/µL", "flag": "normal"}], False),
            ("pat-13", "staff-doc-01", "test-02", "COMPLETED", "Routine", "staff-lab-02", -4, [{"parameter": "Fasting Blood Sugar", "value": "158", "unit": "mg/dL", "flag": "high"}], False),
            ("pat-13", "staff-doc-01", "test-07", "COMPLETED", "Routine", "staff-lab-01", -4, [{"parameter": "Blood Urea", "value": "38", "unit": "mg/dL", "flag": "normal"}, {"parameter": "Serum Creatinine", "value": "1.0", "unit": "mg/dL", "flag": "normal"}, {"parameter": "Uric Acid", "value": "5.5", "unit": "mg/dL", "flag": "normal"}], False),
            ("pat-17", "staff-doc-01", "test-04", "COMPLETED", "Routine", "staff-lab-02", -2, [{"parameter": "Total Cholesterol", "value": "210", "unit": "mg/dL", "flag": "high"}, {"parameter": "Triglycerides", "value": "155", "unit": "mg/dL", "flag": "high"}, {"parameter": "HDL", "value": "42", "unit": "mg/dL", "flag": "normal"}, {"parameter": "LDL", "value": "115", "unit": "mg/dL", "flag": "high"}], False),
            ("pat-19", "staff-doc-01", "test-06", "COMPLETED", "Routine", "staff-lab-01", -1, [{"parameter": "Total Bilirubin", "value": "0.8", "unit": "mg/dL", "flag": "normal"}, {"parameter": "SGOT (AST)", "value": "28", "unit": "U/L", "flag": "normal"}, {"parameter": "SGPT (ALT)", "value": "32", "unit": "U/L", "flag": "normal"}, {"parameter": "Alkaline Phosphatase", "value": "90", "unit": "U/L", "flag": "normal"}], False),
            ("pat-01", "staff-doc-01", "test-11", "COMPLETED", "Urgent", "staff-lab-01", -1, [{"parameter": "Sodium", "value": "128", "unit": "mEq/L", "flag": "critical_low"}, {"parameter": "Potassium", "value": "5.8", "unit": "mEq/L", "flag": "critical_high"}, {"parameter": "Chloride", "value": "95", "unit": "mEq/L", "flag": "low"}], True),
            ("pat-13", "staff-doc-01", "test-02", "COMPLETED", "Stat", "staff-lab-02", 0, [{"parameter": "Fasting Blood Sugar", "value": "320", "unit": "mg/dL", "flag": "critical_high"}], True),
            ("pat-01", "staff-doc-01", "test-01", "ORDERED", "Routine", None, 0, None, False),
            ("pat-02", "staff-doc-02", "test-01", "ORDERED", "Routine", None, 0, None, False),
            ("pat-03", "staff-doc-01", "test-03", "SAMPLE_COLLECTED", "Routine", "staff-lab-01", 0, None, False),
            ("pat-04", "staff-doc-04", "test-09", "SAMPLE_COLLECTED", "Routine", "staff-lab-02", 0, None, False),
            ("pat-05", "staff-doc-01", "test-12", "PROCESSING", "Routine", "staff-lab-01", 0, None, False),
            ("pat-07", "staff-doc-01", "test-04", "PROCESSING", "Urgent", "staff-lab-02", 0, None, False),
            ("pat-11", "staff-doc-01", "test-01", "ORDERED", "Routine", None, 0, None, False),
            ("pat-08", "staff-doc-06", "test-05", "ORDERED", "Routine", None, 0, None, False),
            ("pat-02", "staff-doc-02", "test-10", "COMPLETED", "Routine", "staff-lab-01", -14, [{"parameter": "Blood Group", "value": "A", "unit": "", "flag": "normal"}, {"parameter": "Rh Factor", "value": "Positive", "unit": "", "flag": "normal"}], False),
            ("pat-06", "staff-doc-01", "test-08", "COMPLETED", "Routine", "staff-lab-02", -10, [{"parameter": "pH", "value": "6.0", "unit": "", "flag": "normal"}, {"parameter": "Protein", "value": "Nil", "unit": "", "flag": "normal"}, {"parameter": "Glucose", "value": "Nil", "unit": "", "flag": "normal"}, {"parameter": "RBC", "value": "1", "unit": "/HPF", "flag": "normal"}, {"parameter": "WBC", "value": "2", "unit": "/HPF", "flag": "normal"}], False),
            ("pat-10", "staff-doc-05", "test-12", "COMPLETED", "Routine", "staff-lab-01", -7, [{"parameter": "CRP", "value": "12", "unit": "mg/L", "flag": "high"}], False),
            ("pat-15", "staff-doc-04", "test-09", "COMPLETED", "Routine", "staff-lab-02", -3, [{"parameter": "ESR (Westergren)", "value": "42", "unit": "mm/hr", "flag": "high"}], False),
            ("pat-16", "staff-doc-02", "test-01", "COMPLETED", "Routine", "staff-lab-01", -2, [{"parameter": "Haemoglobin", "value": "11.8", "unit": "g/dL", "flag": "normal"}, {"parameter": "WBC Count", "value": "6.2", "unit": "×10³/µL", "flag": "normal"}, {"parameter": "Platelet Count", "value": "280", "unit": "×10³/µL", "flag": "normal"}, {"parameter": "RBC Count", "value": "4.3", "unit": "×10⁶/µL", "flag": "normal"}], False),
            ("pat-18", "staff-doc-05", "test-01", "COMPLETED", "Routine", "staff-lab-02", -1, [{"parameter": "Haemoglobin", "value": "15.1", "unit": "g/dL", "flag": "normal"}, {"parameter": "WBC Count", "value": "12.5", "unit": "×10³/µL", "flag": "high"}, {"parameter": "Platelet Count", "value": "310", "unit": "×10³/µL", "flag": "normal"}, {"parameter": "RBC Count", "value": "5.2", "unit": "×10⁶/µL", "flag": "normal"}], False),
            ("pat-09", "staff-doc-01", "test-06", "CANCELLED", "Routine", None, -7, None, False),
            ("pat-12", "staff-doc-03", "test-08", "ORDERED", "Routine", None, 1, None, False),
            ("pat-14", "staff-doc-06", "test-05", "ORDERED", "Routine", None, 1, None, False),
            ("pat-15", "staff-doc-04", "test-07", "ORDERED", "Routine", None, 2, None, False),
        ]

        for i, (pid, did, tid, stat, prio, tech_sid, day, results, is_crit) in enumerate(lab_orders_specs, 1):
            lab_id = f"lab-{str(i).zfill(3)}"
            patient = Patient.objects.get(pk=pid)
            doctor = Doctor.objects.get(staff__staff_id=did)
            catalog = LabTestCatalog.objects.get(pk=tid)
            technician = Staff.objects.filter(pk=tech_sid).first() if tech_sid else None

            sample_at = dt_iso(day, 9) if stat in ["SAMPLE_COLLECTED", "PROCESSING", "COMPLETED"] else None
            comp_at = dt_iso(day, 14) if stat == "COMPLETED" else None

            lab_test, _ = LabTest.objects.get_or_create(
                test_id=lab_id,
                defaults={
                    "patient": patient,
                    "doctor": doctor,
                    "test_catalog": catalog,
                    "ordered_date": d(day),
                    "status": stat,
                    "priority": prio,
                    "technician": technician,
                    "sample_collected_at": sample_at,
                    "completed_at": comp_at,
                    "notes": "CRITICAL: Doctor notified immediately" if is_crit else None,
                },
            )

            if results is not None and technician:
                LabTestResult.objects.get_or_create(
                    result_id=f"labr-{str(i).zfill(3)}",
                    defaults={
                        "test": lab_test,
                        "performed_by": technician,
                        "result_date": d(day),
                        "results": results,
                        "is_critical": is_crit,
                        "remarks": "Results validated" if not is_crit else "Critical values detected",
                    },
                )

        # 16. BILLS & BILL ITEMS (10)
        bills_specs = [
            ("bill-001", "pat-01", [{"description": "Consultation — General Medicine", "amount": 50000, "type": "consultation"}, {"description": "CBC", "amount": 35000, "type": "lab"}], 85000, 85000, "PAID", "staff-rec-01", -14),
            ("bill-002", "pat-02", [{"description": "Consultation — Paediatrics", "amount": 60000, "type": "consultation"}, {"description": "Paracetamol Syrup", "amount": 15000, "type": "pharmacy"}], 75000, 75000, "PAID", "staff-rec-01", -14),
            ("bill-003", "pat-03", [{"description": "Consultation — General Medicine", "amount": 50000, "type": "consultation"}, {"description": "FBS + HbA1c", "amount": 60000, "type": "lab"}, {"description": "Metformin", "amount": 15000, "type": "pharmacy"}], 125000, 125000, "PAID", "staff-rec-02", -13),
            ("bill-004", "pat-04", [{"description": "Consultation — Orthopaedics", "amount": 70000, "type": "consultation"}, {"description": "Ibuprofen + Diclofenac Gel", "amount": 33600, "type": "pharmacy"}], 103600, 103600, "PAID", "staff-rec-01", -12),
            ("bill-005", "pat-07", [{"description": "Consultation — General Medicine", "amount": 50000, "type": "consultation"}, {"description": "Lipid Profile", "amount": 55000, "type": "lab"}, {"description": "Losartan", "amount": 12000, "type": "pharmacy"}], 117000, 50000, "PARTIAL", "staff-rec-01", -9),
            ("bill-006", "pat-11", [{"description": "Consultation — General Medicine", "amount": 50000, "type": "consultation"}, {"description": "CBC", "amount": 35000, "type": "lab"}, {"description": "Salbutamol + Montelukast", "amount": 36000, "type": "pharmacy"}], 121000, 121000, "PAID", "staff-rec-02", -6),
            ("bill-007", "pat-13", [{"description": "Consultation — General Medicine", "amount": 50000, "type": "consultation"}, {"description": "FBS + KFT", "amount": 60000, "type": "lab"}, {"description": "Metformin + Amlodipine", "amount": 21000, "type": "pharmacy"}], 131000, 0, "UNPAID", "staff-rec-01", -4),
            ("bill-008", "pat-17", [{"description": "Consultation — General Medicine", "amount": 50000, "type": "consultation"}, {"description": "Lipid Profile", "amount": 55000, "type": "lab"}, {"description": "Amlodipine + Atorvastatin", "amount": 25500, "type": "pharmacy"}], 130500, 70000, "PARTIAL", "staff-rec-02", -2),
            ("bill-009", "pat-01", [{"description": "Consultation — General Medicine (Follow-up)", "amount": 30000, "type": "consultation"}, {"description": "Electrolytes", "amount": 40000, "type": "lab"}], 70000, 0, "UNPAID", "staff-rec-01", 0),
            ("bill-010", "pat-19", [{"description": "Consultation — General Medicine", "amount": 50000, "type": "consultation"}, {"description": "LFT", "amount": 50000, "type": "lab"}, {"description": "Paracetamol", "amount": 2250, "type": "pharmacy"}], 102250, 102250, "PAID", "staff-rec-01", -1),
        ]

        for bid, pid, items, total, paid, stat, creator_sid, day in bills_specs:
            patient = Patient.objects.get(pk=pid)
            creator = Staff.objects.filter(pk=creator_sid).first()
            bill, _ = Bill.objects.get_or_create(
                bill_id=bid,
                defaults={
                    "patient": patient,
                    "bill_date": d(day),
                    "total_amount": to_dec(total),
                    "amount_paid": Decimal("0.00"),
                    "payment_status": "UNPAID",
                    "generated_by": creator,
                },
            )

            for j, it in enumerate(items, 1):
                raw_type = it.get("type", "other").upper()
                itype = "CONSULTATION" if raw_type == "CONSULTATION" else ("LAB_TEST" if raw_type == "LAB" else ("PHARMACY" if raw_type == "PHARMACY" else "OTHER"))
                BillItem.objects.get_or_create(
                    bill_item_id=f"{bid}-item-{j}",
                    defaults={
                        "bill": bill,
                        "item_type": itype,
                        "description": it["description"],
                        "amount": to_dec(it["amount"]),
                    },
                )

        # 17. PAYMENTS (8)
        pay_specs = [
            ("pay-001", "bill-001", 85000, "UPI", "staff-rec-01", -14),
            ("pay-002", "bill-002", 75000, "CASH", "staff-rec-01", -14),
            ("pay-003", "bill-003", 125000, "CARD", "staff-rec-02", -13),
            ("pay-004", "bill-004", 103600, "UPI", "staff-rec-01", -12),
            ("pay-005", "bill-005", 50000, "CASH", "staff-rec-01", -9),
            ("pay-006", "bill-006", 121000, "CARD", "staff-rec-02", -6),
            ("pay-007", "bill-008", 70000, "UPI", "staff-rec-02", -2),
            ("pay-008", "bill-010", 102250, "CASH", "staff-rec-01", -1),
        ]
        for payid, bid, amt, method, rec_by, day in pay_specs:
            bill = Bill.objects.get(pk=bid)
            receiver = Staff.objects.filter(pk=rec_by).first()
            Payment.objects.get_or_create(
                payment_id=payid,
                defaults={
                    "bill": bill,
                    "amount_paid": to_dec(amt),
                    "payment_date": d(day),
                    "payment_method": method,
                    "transaction_ref": f"TXN-{payid.upper()}",
                    "received_by": receiver,
                },
            )

        for bid, _, _, _, _, stat, _, _ in bills_specs:
            bill = Bill.objects.get(pk=bid)
            paid_amount = bill.payments.aggregate(total=Sum("amount_paid"))["total"] or Decimal("0.00")
            if stat == "CANCELLED":
                payment_status = Bill.PaymentStatus.CANCELLED
            elif paid_amount >= bill.total_amount:
                payment_status = Bill.PaymentStatus.PAID
            elif paid_amount > 0:
                payment_status = Bill.PaymentStatus.PARTIAL
            else:
                payment_status = Bill.PaymentStatus.UNPAID
            Bill.objects.filter(pk=bid).update(
                amount_paid=paid_amount,
                payment_status=payment_status,
            )

        # 18. NOTIFICATIONS (8)
        notif_specs = [
            ("notif-01", "LAB_RESULT", "Critical Lab Result", "Patient Arun Nair (CLN-2025-0001) has critical electrolyte levels. Sodium: 128 mEq/L, Potassium: 5.8 mEq/L.", "DOCTOR", "user-doc-01", False),
            ("notif-02", "LAB_RESULT", "Critical Lab Result", "Patient Prasad Namboodiri (CLN-2025-0013) has critical fasting blood sugar: 320 mg/dL.", "DOCTOR", "user-doc-01", False),
            ("notif-03", "STOCK_ALERT", "Out of Stock: Ceftriaxone 1g Inj", "Ceftriaxone 1g Injection is out of stock. Current quantity: 0. Reorder level: 10.", "PHARMACIST", None, False),
            ("notif-04", "STOCK_ALERT", "Expired Medication: Amoxiclav 625mg", f"Batch B2024X01 of Amoxiclav 625mg expired on {d(-30)}. 45 units need disposal.", "PHARMACIST", None, False),
            ("notif-05", "PRESCRIPTION", "New Prescriptions Pending", "6 prescriptions are pending dispensing in the queue.", "PHARMACIST", None, False),
            ("notif-06", "APPOINTMENT", "Today's Appointments", "You have 5 appointments scheduled for today.", "DOCTOR", "user-doc-01", True),
            ("notif-07", "SYSTEM", "System Maintenance", "Scheduled maintenance window: Sunday 2:00 AM – 4:00 AM IST.", None, None, True),
            ("notif-08", "BILLING", "Unpaid Bills Reminder", "2 bills totalling ₹2,010.00 are unpaid and overdue.", "RECEPTIONIST", None, False),
        ]
        for nid, ntype, title, msg, trole, tuid, is_read in notif_specs:
            tuser = User.objects.filter(pk=tuid).first() if tuid else None
            Notification.objects.get_or_create(
                notification_id=nid,
                defaults={
                    "notification_type": ntype,
                    "title": title,
                    "message": msg,
                    "target_role": trole,
                    "target_user": tuser,
                    "is_read": is_read,
                },
            )

        # 19. SETTINGS (8)
        settings_specs = [
            ("set-01", "clinic.name", '"Clinova Healthcare"'),
            ("set-02", "clinic.phone", '"+91-484-2345678"'),
            ("set-03", "clinic.address", '"MG Road, Ernakulam, Kochi - 682011, Kerala"'),
            ("set-04", "clinic.email", '"info@clinova.in"'),
            ("set-05", "appointment.slotDuration", "30"),
            ("set-06", "appointment.startTime", '"09:00"'),
            ("set-07", "appointment.endTime", '"17:00"'),
            ("set-08", "billing.registrationFee", "20000"),
        ]
        for sid, key, val in settings_specs:
            Setting.objects.get_or_create(
                setting_id=sid,
                defaults={"key": key, "value": val},
            )

        self.stdout.write(self.style.SUCCESS("All entities successfully loaded from frontend seed.js!"))

    def print_demo_logins(self):
        self.stdout.write("\n" + "=" * 70)
        self.stdout.write(self.style.SUCCESS("CLINOVA HEALTHCARE — DEMO LOGIN CREDENTIALS"))
        self.stdout.write("=" * 70)
        self.stdout.write(f"{'Role':<15} {'Username':<15} {'Password':<15} {'Staff Name':<22}")
        self.stdout.write("-" * 70)

        demo_accounts = [
            ("ADMIN", "admin", "Admin@123", "Rajesh Kumar"),
            ("DOCTOR", "dr.sarah", "Doctor@123", "Dr. Sarah Thomas"),
            ("DOCTOR", "dr.priya", "Doctor@123", "Dr. Priya Nambiar"),
            ("DOCTOR", "dr.anil", "Doctor@123", "Dr. Anil Kumar"),
            ("DOCTOR", "dr.meera", "Doctor@123", "Dr. Meera Krishnan"),
            ("DOCTOR", "dr.faisal", "Doctor@123", "Dr. Faisal Rahman"),
            ("DOCTOR", "dr.sreelakshmi", "Doctor@123", "Dr. Sreelakshmi Nair"),
            ("RECEPTIONIST", "reception1", "Reception@123", "Anjali Menon"),
            ("RECEPTIONIST", "reception2", "Reception@123", "Deepa Vijayan"),
            ("PHARMACIST", "pharmacy1", "Pharmacy@123", "Lakshmi Devi"),
            ("PHARMACIST", "pharmacy2", "Pharmacy@123", "Vishnu Prasad"),
            ("LAB_TECH", "lab1", "Lab@123", "Arjun Pillai"),
            ("LAB_TECH", "lab2", "Lab@123", "Divya Suresh"),
            ("DOCTOR (Inactive)", "dr.ramesh", "Doctor@123", "Dr. Ramesh Babu"),
        ]

        for role, uname, pwd, sname in demo_accounts:
            self.stdout.write(f"{role:<15} {uname:<15} {pwd:<15} {sname:<22}")
        self.stdout.write("=" * 70 + "\n")
