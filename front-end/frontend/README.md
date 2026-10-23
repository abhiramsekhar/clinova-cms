# Clinova Healthcare — Frontend Application

A fully functional, client-side prototype of a Hospital Management System. It uses `localStorage` as a transactional database and requires no backend to operate.

## Features

- **Role-Based Access Control**: Different views and capabilities for Receptionist, Doctor, Pharmacist, Lab Technician, and Admin.
- **Patient Registration & Billing**: Register patients, book appointments, generate invoices, and collect partial/full payments.
- **Clinical Consultations**: Write clinical notes, issue prescriptions with automated allergy checking, and order lab tests.
- **Pharmacy & Inventory**: FEFO (First-Expire-First-Out) dispensing, stock alerts, supplier management, and purchase order tracking.
- **Laboratory**: Priority-sorted test queue, critical result flagging, printable finalized reports, test billing, and printable payment receipts.
- **Administration**: Manage staff, users, departments, lab catalog pricing, audit logs, and global settings.
- **Dashboard Reporting**: Centralized dashboard metrics with CSV export functionality.

## Folder Structure

\`\`\`
frontend/
├── api/                # Core business logic and database abstractions
├── assets/
│   ├── css/            # Modular CSS files (variables, layout, tables, forms, responsive)
│   ├── fonts/          # Self-hosted Inter variable font
│   ├── icons/          # SVG icon sprites
│   └── images/         # Static assets (logos, avatars)
├── components/         # Shared UI elements (topbar, sidebar, app-shell, ui.js)
├── core/               # App lifecycle (guard.js, session.js)
├── data/               # Local database implementation (db.js, schema.js, seed.js)
├── docs/               # Documentation (DECISIONS.md, PROGRESS.md)
├── pages/
│   ├── admin/          # Admin module pages
│   ├── doctor/         # Doctor module pages
│   ├── lab/            # Lab Tech module pages
│   ├── login/          # Authentication page
│   ├── pharmacy/       # Pharmacist module pages
│   ├── reception/      # Receptionist module pages
│   └── shared/         # Pages shared across roles (patient profile, 403, devtools)
└── index.html          # Entry point (redirects to login)
\`\`\`

## How to Run

1. Open a terminal in this directory.
2. Run a local static server. For example:
   \`\`\`bash
   python -m http.server 8092
   # OR
   npx serve -l 8092
   \`\`\`
3. Navigate to \`http://localhost:8092/frontend/index.html\` in your browser.

## System Accounts

The application includes a deterministic system seed. The following credentials can be used to log in:

- **Admin**: `admin` / `Admin@123`
- **Doctor**: `dr.sarah` / `Doctor@123`
- **Receptionist**: `reception1` / `Reception@123`
- **Pharmacist**: `pharmacy1` / `Pharmacy@123`
- **Lab Tech**: `lab1` / `Lab@123`

## Resetting Data

To start fresh, log in as Admin, go to **Settings > Data Management**, and click **Reset to System Data**. Alternatively, navigate to `/frontend/pages/shared/devtools.html` and click the Reset button.
