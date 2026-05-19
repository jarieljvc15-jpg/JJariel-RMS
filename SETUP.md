# JJ Apartment RMS — Setup Guide

Complete these steps in order before using the app.

---

## Step 1 — Create the Google Spreadsheet

1. Go to [Google Sheets](https://sheets.google.com) and create a new blank spreadsheet.
2. Name it **JJ Apartment RMS**.
3. Copy the spreadsheet ID from the URL:
   - URL format: `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`
   - The ID is the long string between `/d/` and `/edit`.

---

## Step 2 — Create the 7 Sheet Tabs (exact names required)

Rename "Sheet1" to `Buildings` and add 6 more tabs in this order:

| Tab # | Tab Name         |
|-------|-----------------|
| 1     | Buildings        |
| 2     | Units            |
| 3     | Tenants          |
| 4     | UtilityReadings  |
| 5     | Ledger           |
| 6     | Expenses         |
| 7     | Config           |

---

## Step 3 — Add Column Headers (Row 1 of each tab)

Copy these headers exactly (case-sensitive, no extra spaces):

### Buildings
```
BuildingID | BuildingName | Notes
```

### Units
```
UnitID | BuildingID | UnitName | BillingType | CombinedWith | MonthlyRate | Status
```

### Tenants
```
TenantID | Name | UnitID | Contact | Email | MoveInDate | MoveOutDate | Advance | Deposit | PIN | Status
```

### UtilityReadings
```
ReadingID | UnitID | BillingMonth | ElecPrev | ElecCurrent | ElecConsumption | ElecRate | ElecCharge | WaterPrev | WaterCurrent | WaterConsumption | WaterRate | WaterCharge
```

### Ledger
```
TxnID | Date | TenantID | UnitID | BillingMonth | TxnType | RentAmount | ElecAmount | WaterAmount | TotalAmount | Direction | PaymentMode | ReferenceNo | Notes
```

### Expenses
```
ExpenseID | Date | Category | Amount | Payee | Notes
```

### Config
```
Key | Value
```

---

## Step 4 — Enter Seed Data

### Buildings tab (rows 2–3):
| BuildingID | BuildingName | Notes |
|------------|-------------|-------|
| BLD-01     | Main House  |       |
| BLD-02     | Apartments  |       |

### Units tab (rows 2–9):
| UnitID | BuildingID | UnitName    | BillingType | CombinedWith | MonthlyRate | Status |
|--------|------------|-------------|-------------|--------------|-------------|--------|
| MH-01  | BLD-01     | Room 1      | Separate    |              | 0           | Vacant |
| MH-02  | BLD-01     | Room 2      | Separate    |              | 0           | Vacant |
| MH-03  | BLD-01     | Room 3      | Combined    | MH-04        | 0           | Vacant |
| MH-04  | BLD-01     | Room 4      | Combined    | MH-03        | 0           | Vacant |
| APT-01 | BLD-02     | Apartment 1 | Separate    |              | 0           | Vacant |
| APT-02 | BLD-02     | Apartment 2 | Separate    |              | 0           | Vacant |
| APT-03 | BLD-02     | Apartment 3 | Separate    |              | 0           | Vacant |
| APT-04 | BLD-02     | Apartment 4 | Separate    |              | 0           | Vacant |

### Tenants tab (rows 2–3 — sample data):
| TenantID | Name        | UnitID | Contact     | Email                    | MoveInDate | MoveOutDate | Advance | Deposit | PIN  | Status |
|----------|-------------|--------|-------------|--------------------------|------------|-------------|---------|---------|------|--------|
| TNT-001  | Juan dela Cruz | APT-01 | 09171234567 | juan@example.com       | 2025-01-01 |             | 5000    | 5000    | 1234 | Active |
| TNT-002  | Maria Santos  | APT-02 | 09281234567 | maria@example.com      | 2025-01-01 |             | 5000    | 5000    | 5678 | Active |

### Config tab (rows 2–8):
| Key              | Value     |
|-----------------|-----------|
| ElecRate         | 12        |
| WaterRate        | 80        |
| PropertyName     | JJ Apartment |
| AdminContact     |           |
| AdminPassphrase  | admin123  |
| ResendFromEmail  |           |

> **Important:** Change `AdminPassphrase` from `admin123` to a strong passphrase before going live.

---

## Step 5 — Set Up Google Apps Script

1. In your Google Spreadsheet, go to **Extensions → Apps Script**.
2. Delete any existing code in the editor.
3. Copy the entire contents of `/apps-script/Code.gs` from this repo and paste it.
4. At the top of the file, replace `YOUR_SPREADSHEET_ID` with your actual Spreadsheet ID (from Step 1).
5. Click **Save** (floppy disk icon or Ctrl+S).

---

## Step 6 — Add the Resend API Key

1. In the Apps Script editor, go to **Project Settings** (gear icon on the left sidebar).
2. Scroll down to **Script Properties**.
3. Click **Add script property**.
4. Set:
   - **Property name:** `RESEND_API_KEY`
   - **Value:** your Resend API key (get one at [resend.com](https://resend.com))
5. Click **Save script properties**.
6. Also update the `ResendFromEmail` value in your Config sheet tab with the verified sender email from your Resend account.

---

## Step 7 — Deploy the Apps Script as a Web App

1. In the Apps Script editor, click **Deploy → New deployment**.
2. Click the gear icon next to **Select type** and choose **Web app**.
3. Set the following:
   - **Description:** JJ Apartment RMS API
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**.
5. If prompted, click **Authorize access** and follow the OAuth flow (you may see a "Google hasn't verified this app" warning — click **Advanced → Go to [project name]**).
6. Copy the **Web App URL** (it looks like `https://script.google.com/macros/s/AKfy.../exec`).

---

## Step 8 — Configure the Frontend

1. Open `/assets/config.js` in this repo.
2. Replace `YOUR_APPS_SCRIPT_URL` with the Web App URL you copied in Step 7:
   ```js
   const CONFIG = {
     APPS_SCRIPT_URL: "https://script.google.com/macros/s/YOUR_ID/exec"
   };
   ```
3. Commit and push the change.

---

## Step 9 — Enable GitHub Pages

1. Go to your GitHub repository → **Settings → Pages**.
2. Under **Source**, select **Deploy from a branch**.
3. Choose branch: **main** (or your default branch), folder: **/ (root)**.
4. Click **Save**.
5. Wait ~1 minute, then your app will be live at:
   `https://<your-username>.github.io/<your-repo>/`

---

## Step 10 — Test the Setup

1. Open your GitHub Pages URL.
2. Click **Admin Login**.
3. Enter the passphrase you set in the Config sheet (`admin123` by default).
4. The dashboard should load and show real data from your Google Sheet.
5. Click **Tenant Portal** from the login page.
6. Enter Unit ID `APT-01` and PIN `1234` (sample tenant from seed data).

---

## Checklist Summary

- [ ] Google Spreadsheet created with Spreadsheet ID noted
- [ ] All 7 tabs created with exact names
- [ ] All column headers entered exactly as specified
- [ ] Seed data entered (Buildings, Units, Tenants, Config)
- [ ] Apps Script created, `SPREADSHEET_ID` replaced, saved
- [ ] `RESEND_API_KEY` added to Script Properties
- [ ] `ResendFromEmail` set in Config sheet
- [ ] Apps Script deployed as Web App (Anyone access)
- [ ] Web App URL copied into `/assets/config.js`
- [ ] `AdminPassphrase` changed from `admin123` to a strong passphrase
- [ ] GitHub Pages enabled on the repository
- [ ] Admin login tested
- [ ] Tenant login tested with sample tenant

---

## Notes

- **No fixed due date:** Bills are generated manually by the admin for any billing month.
- **Combined units (MH-03/MH-04):** When you save a utility reading for either unit, the system splits consumption 50/50 and writes readings for both units automatically.
- **Balance computation:** Balances are always computed live from the Ledger — nothing is stored as a cached balance.
- **Advance & Deposit:** Recorded as Credit rows in the Ledger at move-in, reducing the opening balance automatically.
- **Currency:** All amounts are in Philippine Peso (₱).
