# CLAUDE.md — JJ Apartment RMS

## Project Overview
A property management web app for JJ Apartment — a real rental property with a Main House (5 units) and Apartments (4 units), ~20 tenants.
- **Frontend:** Pure HTML + Vanilla JavaScript (no frameworks)
- **CSS:** Custom CSS via `/assets/style.css` using CSS variables
- **Backend:** Google Apps Script (`apps-script/Code.gs`) + Google Sheets
- **Hosted:** GitHub Pages (PWA)
- **Users:** Admin (landlord) at `/admin` | Tenants at `/tenant`

---

## Folder Structure
```
/admin        → approvals.html, billing.html, expenses.html, index.html,
                ledger.html, tenants.html, units.html, utilities.html
/tenant       → index.html (tenant portal)
/assets       → style.css, config.js, quick-payment.js
/apps-script  → Code.gs, appsscript.json
/index.html   → root redirect to admin or tenant portal
SETUP.md      → setup and deployment instructions
```

---

## Tech Stack Rules
- Vanilla HTML + CSS + JavaScript ONLY — no React, no Vue, no build tools, no npm
- No new libraries unless absolutely necessary and approved
- All styles go in `/assets/style.css` using CSS variables — never inline styles
- All data reads/writes go through `Code.gs` via `fetch` — never hardcode data
- Always read `Code.gs` before writing new backend functions — reuse existing ones
- Config values (Apps Script URL, Sheet ID) go in `/assets/config.js` only
- All POST fetch calls use `Content-Type: text/plain;charset=utf-8` — never `application/json`
- All HTML paths are relative (`../assets/style.css` not `/assets/style.css`)
- Apps Script `doPost` parses body via `JSON.parse(e.postData.contents)`
- Every `Code.gs` change requires a NEW Apps Script deployment

---

## Git Rules
- **Always create a pull request — never push directly to main**
- One PR per file changed
- Branch naming: `feat/description` or `fix/description`

---

## Design System

### Fonts
- **Headings / Labels:** Nunito — weights 800, 700 (replaces Satoshi)
- **Body / UI:** Inter — weights 600, 500, 400
- **Numbers / Currency:** Nunito Tabular (`font-variant-numeric: tabular-nums`) for digit alignment
- Load via Google Fonts:
```html
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
```

### Colors (CSS Variables)
```css
--navy-900: #0f172a       /* topbar, primary dark background */
--navy-800: #1e293b       /* secondary dark surfaces */
--accent:   #4f7ef8       /* primary buttons, active nav, links */
--success:  #10b981       /* positive balance, approved, active */
--danger:   #ef4444       /* negative balance, delinquent, declined */
--warning:  #f59e0b       /* pending, amber badges */
--bg:       #f8fafc       /* page background */
--surface:  #ffffff       /* cards, panels */
--border:   #e2e8f0       /* card borders, dividers */
--text-primary:   #0f172a
--text-secondary: #64748b
--text-muted:     #94a3b8
```

### Spacing & Shape
```css
--radius:    12px    /* cards, panels, modals */
--radius-sm: 8px     /* buttons, inputs, badges */
--radius-xs: 6px     /* small badges, pills */
```

### Layout
- Mobile-first
- Topbar: 56px tall, navy background, white title (Nunito 700, 18px)
- Bottom nav: 64px tall, 5 items max
- Page content: `padding-bottom: 80px` always (accounts for bottom nav + FAB)
- Bottom nav items: Home | Tenants | Approvals | Ledger | More
- More drawer items: Units | Utilities | Expenses | Billing

### Icons
- Use **Lucide Icons** exclusively — no emojis, no other icon sets
- SVG outline only, `stroke-width: 1.75`
- Load via CDN in every HTML file:
```html
<script src="https://unpkg.com/lucide@latest"></script>
```
- Initialize after DOM load: `lucide.createIcons()`

### Currency Display
- Format: `₱1,234.56` — always 2 decimal places
- Positive balance (owes money): red (`--danger`)
- Zero balance: black (`--text-primary`)
- Credit (overpaid): green (`--success`) with "credit" label
- Use `Nunito` with `font-variant-numeric: tabular-nums` for all amounts

### Badges / Pills
- Shape: `border-radius: 99px`, padding `2px 10px`, font-size `11px`, Nunito 700
- Pending: amber background `#fef3c7`, text `#d97706`
- Approved / Active: green background `#d1fae5`, text `#059669`
- Declined / Danger: red background `#fee2e2`, text `#dc2626`
- Admin Recorded: gray background `#f1f5f9`, text `#64748b`

---

## Unit Structure
```
BLD-01 — Main House
  MH-1A, MH-1B  (Floor 1)
  MH-2A, MH-2B  (Floor 2)
  MH-3A          (Floor 3)

BLD-02 — Apartments
  APT-01 (R1), APT-02 (R2), APT-03 (2R2), APT-04 (2R1)
```

---

## Google Sheets Structure
Sheet ID: `1S-bQ05Jdf3ICkRutZhdJo-mf7I2QLij2i6WM3CFeIsE`

| Sheet | Key Columns |
|-------|-------------|
| Tenants | TenantID, Name, UnitID, Contact, Email, PIN, MoveInDate, Advance, Deposit, Status |
| Units | UnitID, UnitName, BuildingID, BuildingName, Type, Rate, Status |
| Ledger | TxnID, Date, TenantID, TenantName, UnitID, BillingMonth, TxnType, Amount, Notes |
| Bills | BillID, TenantID, UnitID, BillingMonth, BillType, Amount, Status |
| Payments | PaymentID, TenantID, UnitID, BillingMonth, Amount, ReferenceNo, Notes, Method |
| Expenses | ExpenseID, Date, Category, Payee, Amount, Notes |
| Utilities | ReadingID, UnitID, BillingMonth, PrevReading, CurrReading, Consumption, Rate, Charge, Type |
| PaymentProofs | ProofID, TenantID, TenantName, UnitID, Amount, ReferenceNo, Notes, BillingMonth, BillType, ImageUrl, Status, SubmittedAt, DeclineReason, ReviewedAt |
| Notes | Timestamp, TenantID, TenantName, UnitID, Note |

---

## Balance Logic
- Deposit excluded from running balance (only considered at move-out)
- Advance offsets bills only when a Bill exists for that month
- Negative balance = green "₱X.XX credit"
- Zero = ₱0.00 (black)
- Positive = red ₱X.XX (tenant owes)
- Delinquent = balance strictly > 0

---

## Auth
- Admin: passphrase stored in `localStorage` as `adminToken`
- Tenant: UnitID + 4-digit PIN
- Every admin page must redirect unauthenticated users to login

---

## Email
- Sent via `GmailApp` from `jarieljvc15@gmail.com`
- Admin copy to `JJarielRentals@outlook.com`
- HTML email template: navy header + content body + footer
- Receipt emails: emerald green accent
- Reminder/decline emails: red accent

---

## Known Test Data
- SpadeY, Spades, Spadeyyob are test tenants in APT-01
- Will be cleaned up in Step 6
