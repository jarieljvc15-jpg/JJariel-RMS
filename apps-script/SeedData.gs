// =============================================================================
// SeedData.gs — One-time seed script for JJ Apartment RMS
// =============================================================================
// HOW TO USE:
//   1. Open your Apps Script project (the one linked to the RMS spreadsheet)
//   2. Click "+" → New script file → name it "SeedData"
//   3. Paste this entire file, replacing the default content
//   4. Save (Ctrl+S / Cmd+S)
//   5. Select function "seedAllData" from the dropdown, then click ▶ Run
//   6. Grant permissions when prompted
//   7. Verify rows in Buildings (5), Units (19), Tenants (19), Config (6)
//
// WHAT IT DOES:
//   - Clears rows 2+ in Buildings, Units, Tenants, Config
//   - Writes all real tenant/unit data from the approved list
//   - Does NOT touch Ledger or UtilityReadings tabs
//
// SAFE TO RE-RUN: clears data rows first, so re-running is idempotent
// =============================================================================

var SEED_SPREADSHEET_ID = '1S-bQ05Jdf3ICkRutZhdJo-mf7I2QLij2i6WM3CFeIsE';

function seedAllData() {
  var ss = SpreadsheetApp.openById(SEED_SPREADSHEET_ID);

  seedBuildings(ss);
  seedUnits(ss);
  seedTenants(ss);
  seedConfig(ss);

  ss.toast(
    '5 buildings • 19 units • 19 tenants • 6 config keys written.',
    '✅ Seed Complete',
    10
  );
  Logger.log('seedAllData() finished successfully.');
}

// -----------------------------------------------------------------------------
// Buildings tab
// Columns: BuildingID | BuildingName | Notes
// -----------------------------------------------------------------------------
function seedBuildings(ss) {
  var sheet = ss.getSheetByName('Buildings');
  if (!sheet) { Logger.log('ERROR: Buildings sheet not found'); return; }

  clearDataRows(sheet, 3);

  var data = [
    ['BLD-01', 'Main House',   ''],
    ['BLD-02', 'Apartment 1',  ''],
    ['BLD-03', 'Apartment 2',  ''],
    ['BLD-04', 'Apartment 3',  ''],
    ['BLD-05', 'Apartment 4',  ''],
  ];

  sheet.getRange(2, 1, data.length, 3).setValues(data);
  Logger.log('Buildings: ' + data.length + ' rows written.');
}

// -----------------------------------------------------------------------------
// Units tab
// Columns: UnitID | BuildingID | UnitName | BillingType | CombinedWith | MonthlyRate | Status
// -----------------------------------------------------------------------------
function seedUnits(ss) {
  var sheet = ss.getSheetByName('Units');
  if (!sheet) { Logger.log('ERROR: Units sheet not found'); return; }

  clearDataRows(sheet, 7);

  // Main House (BLD-01) — 5 units @ ₱3,000
  // Apartment 1 (BLD-02) — 8 units (1A-1D @ ₱2,000-3,000 ; 2A-2D @ ₱3,500)
  // Apartment 2 (BLD-03) — 1 unit (Guards) @ ₱6,000
  // Apartment 3 (BLD-04) — 4 units @ varying rates
  // Apartment 4 (BLD-05) — 1 unit @ ₱3,500
  var data = [
    // UnitID      BuildingID  UnitName        BillingType  CombinedWith  MonthlyRate  Status
    ['MH-1A',     'BLD-01',   'Unit 1A',      'Separate',  '',           3000,        'Occupied'],
    ['MH-1B',     'BLD-01',   'Unit 1B',      'Separate',  '',           3000,        'Occupied'],
    ['MH-2A',     'BLD-01',   'Unit 2A',      'Separate',  '',           3000,        'Occupied'],
    ['MH-2B',     'BLD-01',   'Unit 2B',      'Separate',  '',           3000,        'Occupied'],
    ['MH-3A',     'BLD-01',   'Unit 3A',      'Separate',  '',           3000,        'Occupied'],
    ['APT1-1A',   'BLD-02',   'Unit 1A',      'Separate',  '',           2000,        'Occupied'],
    ['APT1-1B',   'BLD-02',   'Unit 1B',      'Separate',  '',           2000,        'Occupied'],
    ['APT1-1C',   'BLD-02',   'Unit 1C',      'Separate',  '',           3000,        'Occupied'],
    ['APT1-1D',   'BLD-02',   'Unit 1D',      'Separate',  '',           3000,        'Occupied'],
    ['APT1-2A',   'BLD-02',   'Unit 2A',      'Separate',  '',           3500,        'Occupied'],
    ['APT1-2B',   'BLD-02',   'Unit 2B',      'Separate',  '',           3500,        'Occupied'],
    ['APT1-2C',   'BLD-02',   'Unit 2C',      'Separate',  '',           3500,        'Occupied'],
    ['APT1-2D',   'BLD-02',   'Unit 2D',      'Separate',  '',           3500,        'Occupied'],
    ['APT2-HOU',  'BLD-03',   'Unit House',   'Separate',  '',           6000,        'Occupied'],
    ['APT3-1A',   'BLD-04',   'Unit 1A',      'Separate',  '',           3000,        'Occupied'],
    ['APT3-1C',   'BLD-04',   'Unit 1C',      'Separate',  '',           1500,        'Occupied'],
    ['APT3-2',    'BLD-04',   'Unit 2',       'Separate',  '',           3000,        'Occupied'],
    ['APT3-SH',   'BLD-04',   'Unit Shared',  'Separate',  '',           1500,        'Occupied'],
    ['APT4-2A',   'BLD-05',   'Unit 2A',      'Separate',  '',           3500,        'Occupied'],
  ];

  sheet.getRange(2, 1, data.length, 7).setValues(data);
  Logger.log('Units: ' + data.length + ' rows written.');
}

// -----------------------------------------------------------------------------
// Tenants tab
// Columns: TenantID | Name | UnitID | Contact | Email | MoveInDate | MoveOutDate | Advance | Deposit | PIN | Status
// -----------------------------------------------------------------------------
function seedTenants(ss) {
  var sheet = ss.getSheetByName('Tenants');
  if (!sheet) { Logger.log('ERROR: Tenants sheet not found'); return; }

  clearDataRows(sheet, 11);

  // MoveInDate: left blank — fill directly in sheet later
  // Contact:    left blank — no phone numbers provided
  // PIN:        0000 for all — update per tenant later via admin panel
  // Advance:    0 — Ledger credits to be added separately
  // Deposit:    0 — Ledger credits to be added separately
  var data = [
    // TenantID    Name              UnitID       Contact  Email                           MoveInDate  MoveOutDate  Advance  Deposit  PIN     Status
    ['TNT-001', 'Atlanta',          'MH-1A',      '',     'jarielxjv@gmail.com',           '',         '',          0,       0,      '0000', 'Active'],
    ['TNT-002', 'Rosaia',           'MH-1B',      '',     '',                              '',         '',          0,       0,      '0000', 'Active'],
    ['TNT-003', 'Mae',              'MH-2A',      '',     '',                              '',         '',          0,       0,      '0000', 'Active'],
    ['TNT-004', 'Frank',            'MH-2B',      '',     '',                              '',         '',          0,       0,      '0000', 'Active'],
    ['TNT-005', 'Shuenmei',         'MH-3A',      '',     '',                              '',         '',          0,       0,      '0000', 'Active'],
    ['TNT-006', 'Jhomar',           'APT1-1A',    '',     '',                              '',         '',          0,       0,      '0000', 'Active'],
    ['TNT-007', 'Jhomar Friend',    'APT1-1B',    '',     '',                              '',         '',          0,       0,      '0000', 'Active'],
    ['TNT-008', 'Emily',            'APT1-1C',    '',     'gardoseemily4@gmail.com',       '',         '',          0,       0,      '0000', 'Active'],
    ['TNT-009', 'Christine',        'APT1-1D',    '',     'colecristinejoy@gmail.com',     '',         '',          0,       0,      '0000', 'Active'],
    ['TNT-010', 'Pauline',          'APT1-2A',    '',     'deluispauline3@gmail.com',      '',         '',          0,       0,      '0000', 'Active'],
    ['TNT-011', 'Alliah',           'APT1-2B',    '',     '',                              '',         '',          0,       0,      '0000', 'Active'],
    ['TNT-012', 'Angge',            'APT1-2C',    '',     '',                              '',         '',          0,       0,      '0000', 'Active'],
    ['TNT-013', 'Lhen',             'APT1-2D',    '',     '',                              '',         '',          0,       0,      '0000', 'Active'],
    ['TNT-014', 'Guards',           'APT2-HOU',   '',     'magpantay.jerico@mdc.com.ph',   '',         '',          0,       0,      '0000', 'Active'],
    ['TNT-015', 'Anna Mae',         'APT3-1A',    '',     '',                              '',         '',          0,       0,      '0000', 'Active'],
    ['TNT-016', 'Jay',              'APT3-1C',    '',     '',                              '',         '',          0,       0,      '0000', 'Active'],
    ['TNT-017', 'Cathy',            'APT3-2',     '',     '',                              '',         '',          0,       0,      '0000', 'Active'],
    ['TNT-018', 'Eugene',           'APT3-SH',    '',     '',                              '',         '',          0,       0,      '0000', 'Active'],
    ['TNT-019', 'Mai',              'APT4-2A',    '',     '',                              '',         '',          0,       0,      '0000', 'Active'],
  ];

  sheet.getRange(2, 1, data.length, 11).setValues(data);
  Logger.log('Tenants: ' + data.length + ' rows written.');
}

// -----------------------------------------------------------------------------
// Config tab
// Columns: Key | Value
// -----------------------------------------------------------------------------
function seedConfig(ss) {
  var sheet = ss.getSheetByName('Config');
  if (!sheet) { Logger.log('ERROR: Config sheet not found'); return; }

  clearDataRows(sheet, 2);

  var data = [
    ['ElecRate',        ''],           // Left blank — update monthly from Meralco bill
    ['WaterRate',       '80'],
    ['PropertyName',    'JJ Apartment'],
    ['AdminContact',    ''],           // Fill with admin phone/email
    ['AdminPassphrase', 'admin123'],   // ⚠️ CHANGE THIS before sharing the app URL
    ['ResendFromEmail', ''],           // Fill with Resend sender email if using email receipts
  ];

  sheet.getRange(2, 1, data.length, 2).setValues(data);
  Logger.log('Config: ' + data.length + ' rows written.');
}

// -----------------------------------------------------------------------------
// Helper: safely clear data rows (row 2 onward), skipping if sheet is empty
// -----------------------------------------------------------------------------
function clearDataRows(sheet, numCols) {
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, numCols).clearContent();
  }
}
