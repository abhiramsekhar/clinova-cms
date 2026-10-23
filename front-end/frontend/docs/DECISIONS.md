# Clinova Healthcare — Design Decisions

## Images: SVG Placeholder Portraits Instead of Photos

**Decision:** Staff portraits use SVG placeholders displaying initials on a coloured background, rather than photographic portraits.

**Reason:** Image generation quota was exhausted during the build. The avatar component (`components/avatar.js`) already includes a robust fallback to initials-based avatars when image files fail to load.

**Impact:** The application is fully functional. The initials-based avatar provides a clean, professional appearance. Photographic portraits can be added later by placing WebP/JPEG files in `assets/images/staff/` and updating seed data.

## Login Hero: SVG Abstract Pattern Instead of Photography

**Decision:** The login page visual panel uses an SVG abstract medical pattern (ECG pulse lines and cross shapes on a navy background) rather than a photographic hospital interior.

**Reason:** Same image generation constraint. The SVG pattern is lightweight, loads instantly, and maintains the clinical/professional aesthetic.

## Font: Inter Variable Font (Single File)

**Decision:** Using the Inter variable weight font (`inter-variable.woff2`) instead of three separate weight files.

**Reason:** A single variable font file covers all weights (400/500/600 and more), reducing HTTP requests and simplifying font management.

## Currency Storage: Integer Paise

All monetary values are stored as integer paise (1 rupee = 100 paise) to avoid floating-point arithmetic errors. Display formatting uses `Intl.NumberFormat('en-IN')` with division by 100.

## Disconnected Prototypes Removed (2026-09-29)

Two feature areas were found as disconnected prototypes and will be rebuilt properly inside the design system: (a) a fuller pharmacy supply chain — Purchases, Suppliers, Stock Alerts, Dispensing History — planned for the Pharmacy phase; (b) a doctor-initiated lab test that doesn't require an open consultation, planned for the Doctor phase.

**What was removed and why:**

- **Pharmacy stubs** (`bills.html`, `purchases.html`, `suppliers.html`, `stock-alerts.html`): shell pages with no real content; all used the old prototype's `theme.css` and `core.js`, not the new design system.
- **Lab prototype** (`lab/Doctor.html`, `lab/lab-queue.html`, `lab/lab.css`, `lab/script.js`, `lab/Common.js`): standalone pages with their own CSS and hardcoded data, disconnected from the design system.
- **Old root prototype** (`index.html`, `css/`, `js/`, `admin/`, `doctor/`, `reception/`, `pharmacy/`): the entire legacy SPA shell; superseded by the `frontend/` design system.
- **Backup file** (`reception/reception_backup.js`): duplicate of `reception.js`.

## Ideas for Later
