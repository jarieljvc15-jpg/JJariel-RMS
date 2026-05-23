// ============================================================
// JJ Apartment RMS — Google Apps Script Backend
// ============================================================

var SPREADSHEET_ID = "1S-bQ05Jdf3ICkRutZhdJo-mf7I2QLij2i6WM3CFeIsE";

// ============================================================
// ROUTERS
// ============================================================

function doGet(e) {
  try {
    var action = e.parameter.action;
    var params = e.parameter;

    switch (action) {
      case "getBuildings":   return respond(getBuildings());
      case "getUnits":       return respond(getUnits());
      case "getTenants":     return respond(getTenants());
      case "getLedger":      return respond(getLedger(params));
      case "getBalance":     return respond(getBalance(params));
      case "getReadings":    return respond(getReadings(params));
      case "getExpenses":    return respond(getExpenses(params));
      case "verifyTenant":   return respond(verifyTenant(params));
      case "getDashboard":   return respond(getDashboardData());
      default:
        return respond(null, "Unknown action: " + action);
    }
  } catch (err) {
    return respond(null, err.message);
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;

    var cfg = getConfig();
    if (body.adminToken !== cfg["AdminPassphrase"]) {
      return respond(null, "Unauthorized");
    }

    var lock = LockService.getScriptLock();
    lock.tryLock(10000);
    try {
      var result;
      switch (action) {
        case "generateBill":   result = generateBill(body);   break;
        case "recordPayment":  result = recordPayment(body);  break;
        case "uploadProof":    result = uploadProof(body);    break;
        case "saveReading":    result = saveReading(body);    break;
        case "addTenant":      result = addTenant(body);      break;
        case "moveTenant":     result = moveTenant(body);     break;
        case "addExpense":     result = addExpense(body);     break;
        case "addNote":        result = addNote(body);        break;
        case "sendReminder":   result = sendReminder(body);   break;
        case "updateTenant":   result = updateTenant(body);   break;
        case "updateConfig":   result = updateConfig(body);   break;
        default:
          result = { message: "Unknown action: " + action };
      }
      return respond(result);
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return respond(null, err.message);
  }
}

// ============================================================
// HELPERS
// ============================================================

function respond(data, error) {
  var payload = error
    ? { success: false, error: error }
    : { success: true, data: data };
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet(name) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error("Sheet not found: " + name);
  return sheet;
}

function sheetToJSON(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0].map(function(h) { return String(h).trim(); });
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      var val = data[i][j];
      if (val instanceof Date) {
        val = Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
      }
      row[headers[j]] = val;
    }
    rows.push(row);
  }
  return rows;
}

function getConfig() {
  var rows = sheetToJSON(getSheet("Config"));
  var cfg = {};
  rows.forEach(function(r) { cfg[r["Key"]] = r["Value"]; });
  return cfg;
}

function appendSheetRow(sheet, data) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = headers.map(function(h) {
    var key = String(h).trim();
    return data.hasOwnProperty(key) ? data[key] : "";
  });
  sheet.appendRow(row);
}

function generateTxnID() {
  var ts  = Date.now().toString(36).toUpperCase();
  var rnd = Math.random().toString(36).substring(2, 6).toUpperCase();
  return "TXN-" + ts + "-" + rnd;
}

function isTxnIDDuplicate(txnId) {
  var sheet = getSheet("Ledger");
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === txnId) return true;
  }
  return false;
}

// Normalises a BillingMonth value to "YYYY-MM".
// Sheets auto-converts "2026-05" → Date, which sheetToJSON serialises back
// as "2026-05-01".  Taking the first 7 chars handles both forms.
function normMonth(val) {
  return String(val || "").substring(0, 7);
}

// Positive = tenant owes money. Negative = tenant has credit.
// Deposit credits are never counted.
// Advance credits only offset when at least one Bill/Debit exists.
function computeBalance(tenantId) {
  var allRows = sheetToJSON(getSheet("Ledger")).filter(function(r) {
    return String(r["TenantID"]) === String(tenantId);
  });

  // Strip out Deposit credits entirely
  var rows = allRows.filter(function(r) {
    var isDepositCredit = r["Direction"] === "Credit" &&
      String(r["Notes"] || "").toLowerCase().indexOf("deposit") !== -1;
    return !isDepositCredit;
  });

  // If no Debit rows exist yet, new tenant has zero balance
  var hasDebits = rows.some(function(r) { return r["Direction"] === "Debit"; });
  if (!hasDebits) {
    return { rent: 0, elec: 0, water: 0, total: 0 };
  }

  var balance = { rent: 0, elec: 0, water: 0, total: 0 };
  rows.forEach(function(r) {
    var sign = r["Direction"] === "Debit" ? 1 : -1;
    balance.rent  += sign * (parseFloat(r["RentAmount"])  || 0);
    balance.elec  += sign * (parseFloat(r["ElecAmount"])  || 0);
    balance.water += sign * (parseFloat(r["WaterAmount"]) || 0);
  });
  balance.total = balance.rent + balance.elec + balance.water;
  return balance;
}

// ============================================================
// GET HANDLERS
// ============================================================

function getBuildings() {
  return sheetToJSON(getSheet("Buildings"));
}

function getUnits() {
  var units     = sheetToJSON(getSheet("Units"));
  var buildings = sheetToJSON(getSheet("Buildings"));
  var bldMap    = {};
  buildings.forEach(function(b) { bldMap[b["BuildingID"]] = b["BuildingName"]; });

  return units.map(function(u) {
    u["BuildingName"] = bldMap[u["BuildingID"]] || "";
    return u;
  });
}

function getTenants() {
  var tenants   = sheetToJSON(getSheet("Tenants")).filter(function(t) {
    return t["Status"] === "Active";
  });
  var units     = sheetToJSON(getSheet("Units"));
  var buildings = sheetToJSON(getSheet("Buildings"));

  var unitMap = {};
  units.forEach(function(u) { unitMap[u["UnitID"]] = u; });
  var bldMap  = {};
  buildings.forEach(function(b) { bldMap[b["BuildingID"]] = b["BuildingName"]; });

  return tenants.map(function(t) {
    var unit = unitMap[t["UnitID"]] || {};
    t["UnitName"]     = unit["UnitName"]    || "";
    t["BuildingName"] = bldMap[unit["BuildingID"]] || "";
    delete t["PIN"];
    return t;
  });
}

function getLedger(params) {
  var rows = sheetToJSON(getSheet("Ledger"));

  if (params.tenantId) {
    rows = rows.filter(function(r) { return r["TenantID"] === params.tenantId; });
  }
  if (params.unitId) {
    rows = rows.filter(function(r) { return r["UnitID"] === params.unitId; });
  }
  if (params.billingMonth) {
    rows = rows.filter(function(r) { return normMonth(r["BillingMonth"]) === normMonth(params.billingMonth); });
  }
  return rows;
}

function getBalance(params) {
  if (!params.tenantId) throw new Error("tenantId is required");
  return computeBalance(params.tenantId);
}

function getReadings(params) {
  var rows = sheetToJSON(getSheet("UtilityReadings"));

  if (params.unitId) {
    rows = rows.filter(function(r) { return r["UnitID"] === params.unitId; });
  }
  if (params.billingMonth) {
    rows = rows.filter(function(r) { return normMonth(r["BillingMonth"]) === normMonth(params.billingMonth); });
  }
  return rows;
}

function getExpenses(params) {
  var rows = sheetToJSON(getSheet("Expenses"));

  if (params.month) {
    rows = rows.filter(function(r) {
      return String(r["Date"]).substring(0, 7) === params.month;
    });
  }
  return rows;
}

function verifyTenant(params) {
  if (!params.unitId || !params.pin) throw new Error("unitId and pin are required");

  var tenants = sheetToJSON(getSheet("Tenants"));
  var match = tenants.filter(function(t) {
    return t["UnitID"]  === params.unitId &&
           String(t["PIN"]) === String(params.pin) &&
           t["Status"]  === "Active";
  });

  if (match.length === 0) throw new Error("Invalid Unit ID or PIN");

  var tenant = match[0];
  delete tenant["PIN"];

  var units  = sheetToJSON(getSheet("Units"));
  var unit   = units.filter(function(u) { return u["UnitID"] === tenant["UnitID"]; })[0] || {};
  tenant["UnitName"]    = unit["UnitName"]    || "";
  tenant["BillingType"] = unit["BillingType"] || "";

  return tenant;
}

function getDashboardData() {
  var units   = sheetToJSON(getSheet("Units"));
  var tenants = sheetToJSON(getSheet("Tenants")).filter(function(t) {
    return t["Status"] === "Active";
  });
  var ledger  = sheetToJSON(getSheet("Ledger"));

  var totalUnits    = units.length;
  var occupiedUnits = units.filter(function(u) { return u["Status"] === "Occupied"; }).length;
  var occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

  var now          = new Date();
  var currentMonth = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM");

  var currentMonthBilled    = 0;
  var currentMonthCollected = 0;
  ledger.forEach(function(r) {
    var rowMonth = String(r["BillingMonth"] || "").trim().substring(0, 7);
    if (rowMonth !== currentMonth) return;
    var amt     = parseFloat(r["TotalAmount"]) || 0;
    var txnType = String(r["TxnType"]    || "").trim();
    var dir     = String(r["Direction"]  || "").trim();
    if (txnType === "Bill"    && dir === "Debit")  currentMonthBilled    += amt;
    if (txnType === "Payment" && dir === "Credit") currentMonthCollected += amt;
  });

  // totalOutstanding: one-pass sum over all ledger rows.
  // Deposit credits are excluded (they are held as security, not a payment).
  var totalOutstanding = 0;
  ledger.forEach(function(r) {
    var isDepositCredit = String(r["Direction"] || "").trim() === "Credit" &&
      String(r["Notes"] || "").toLowerCase().indexOf("deposit") !== -1;
    if (isDepositCredit) return;
    var amt = parseFloat(r["TotalAmount"]) || 0;
    if (String(r["Direction"] || "").trim() === "Debit")  totalOutstanding += amt;
    if (String(r["Direction"] || "").trim() === "Credit") totalOutstanding -= amt;
  });
  if (totalOutstanding < 0) totalOutstanding = 0;

  var delinquentTenants = [];

  var unitMap = {};
  units.forEach(function(u) { unitMap[u["UnitID"]] = u; });
  var bldMap = {};
  sheetToJSON(getSheet("Buildings")).forEach(function(b) {
    bldMap[b["BuildingID"]] = b["BuildingName"];
  });

  tenants.forEach(function(tenant) {
    var balance = computeBalance(tenant["TenantID"]);
    if (balance.total <= 0) return; // skip zero or credit tenants

    var tenantLedger = ledger.filter(function(r) {
      return r["TenantID"] === tenant["TenantID"];
    });

    var monthMap = {};
    tenantLedger.forEach(function(r) {
      var m = String(r["BillingMonth"] || "").trim().substring(0, 7);
      if (!m) return;
      // Skip deposit credits in month map too
      var isDepositCredit = String(r["Direction"] || "").trim() === "Credit" &&
        String(r["Notes"] || "").toLowerCase().indexOf("deposit") !== -1;
      if (isDepositCredit) return;

      if (!monthMap[m]) monthMap[m] = { rent: 0, elec: 0, water: 0 };
      var sign = String(r["Direction"] || "").trim() === "Debit" ? 1 : -1;
      monthMap[m].rent  += sign * (parseFloat(r["RentAmount"])  || 0);
      monthMap[m].elec  += sign * (parseFloat(r["ElecAmount"])  || 0);
      monthMap[m].water += sign * (parseFloat(r["WaterAmount"]) || 0);
    });

    var unpaidMonths = Object.keys(monthMap)
      .filter(function(m) {
        var mo = monthMap[m];
        return (mo.rent + mo.elec + mo.water) > 0;
      })
      .sort()
      .map(function(m) {
        var mo = monthMap[m];
        return {
          month:     m,
          rentOwed:  mo.rent,
          elecOwed:  mo.elec,
          waterOwed: mo.water,
          total:     mo.rent + mo.elec + mo.water
        };
      });

    if (unpaidMonths.length === 0) return;

    var unit = unitMap[tenant["UnitID"]] || {};
    delinquentTenants.push({
      tenantId:     tenant["TenantID"],
      name:         tenant["Name"],
      unit:         unit["UnitName"]    || tenant["UnitID"],
      building:     bldMap[unit["BuildingID"]] || "",
      unpaidMonths: unpaidMonths,
      totalOwed:    balance.total
    });
  });

  delinquentTenants.sort(function(a, b) {
    var aOldest = a.unpaidMonths[0] ? a.unpaidMonths[0].month : "";
    var bOldest = b.unpaidMonths[0] ? b.unpaidMonths[0].month : "";
    return aOldest < bOldest ? -1 : 1;
  });

  return {
    occupancyRate:         occupancyRate,
    totalUnits:            totalUnits,
    occupiedUnits:         occupiedUnits,
    currentMonthCollected: currentMonthCollected,
    currentMonthBilled:    currentMonthBilled,
    totalOutstanding:      totalOutstanding,
    delinquentTenants:     delinquentTenants
  };
}

// ============================================================
// POST HANDLERS
// ============================================================

function generateBill(body) {
  var billingMonth = String(body.billingMonth || "").trim();
  if (!billingMonth) throw new Error("billingMonth is required");

  var tenants;
  if (body.tenantId) {
    var allTenants = sheetToJSON(getSheet("Tenants"));
    var found = allTenants.filter(function(t) { return t["TenantID"] === body.tenantId; });
    if (found.length === 0) throw new Error("Tenant not found");
    tenants = found;
  } else {
    tenants = sheetToJSON(getSheet("Tenants")).filter(function(t) {
      return t["Status"] === "Active";
    });
  }

  var units = sheetToJSON(getSheet("Units"));
  var unitMap = {};
  units.forEach(function(u) { unitMap[u["UnitID"]] = u; });

  var readings = sheetToJSON(getSheet("UtilityReadings")).filter(function(r) {
    return normMonth(r["BillingMonth"]) === normMonth(billingMonth);
  });

  var ledgerSheet = getSheet("Ledger");
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

  var billsCreated = 0;
  var skipped = 0;

  tenants.forEach(function(tenant) {
    var tenantId    = tenant["TenantID"];
    var unitId      = tenant["UnitID"];
    var unit        = unitMap[unitId] || {};
    var monthlyRate = parseFloat(unit["MonthlyRate"]) || 0;

    var reading     = readings.filter(function(r) { return r["UnitID"] === unitId; })[0] || {};
    var elecCharge  = parseFloat(reading["ElecCharge"])  || 0;
    var waterCharge = parseFloat(reading["WaterCharge"]) || 0;

    // Roll over prior positive (unpaid) per-category balances
    var prior = computeBalance(tenantId);
    var priorRent  = prior.rent  > 0 ? prior.rent  : 0;
    var priorElec  = prior.elec  > 0 ? prior.elec  : 0;
    var priorWater = prior.water > 0 ? prior.water : 0;

    var txnId = "BILL-" + tenantId + "-" + billingMonth;
    if (isTxnIDDuplicate(txnId)) {
      skipped++;
      return;
    }

    var rentAmount  = Math.max(0, monthlyRate + priorRent);
    var elecAmount  = Math.max(0, elecCharge  + priorElec);
    var waterAmount = Math.max(0, waterCharge + priorWater);
    var totalAmount = rentAmount + elecAmount + waterAmount;

    appendSheetRow(ledgerSheet, {
      TxnID:        txnId,
      TenantID:     tenantId,
      UnitID:       unitId,
      BillingMonth: billingMonth,
      TxnType:      "Bill",
      Direction:    "Debit",
      RentAmount:   rentAmount,
      ElecAmount:   elecAmount,
      WaterAmount:  waterAmount,
      TotalAmount:  totalAmount,
      Notes:        "Monthly Bill",
      Date:         today
    });

    billsCreated++;
  });

  return { billsCreated: billsCreated, skipped: skipped };
}

function recordPayment(body) {
  var tenantId     = String(body.tenantId     || "").trim();
  var billingMonth = String(body.billingMonth || "").trim();
  var totalPaid    = parseFloat(body.totalPaid)    || 0;
  var rentAmount   = parseFloat(body.rentAmount)   || 0;
  var elecAmount   = parseFloat(body.elecAmount)   || 0;
  var waterAmount  = parseFloat(body.waterAmount)  || 0;
  var paymentMode  = String(body.paymentMode  || "").trim();
  var referenceNo  = String(body.referenceNo  || "").replace(/[`'"]/g, "").trim();
  var notes        = String(body.notes        || "").trim();

  if (!tenantId) throw new Error("tenantId is required");
  if (totalPaid <= 0) throw new Error("totalPaid must be greater than 0");

  var tenants = sheetToJSON(getSheet("Tenants"));
  var tenant  = tenants.filter(function(t) { return t["TenantID"] === tenantId; })[0];
  if (!tenant) throw new Error("Tenant not found");

  var units = sheetToJSON(getSheet("Units"));
  var unit  = units.filter(function(u) { return u["UnitID"] === tenant["UnitID"]; })[0] || {};

  var buildings = sheetToJSON(getSheet("Buildings"));
  var bldMap = {};
  buildings.forEach(function(b) { bldMap[b["BuildingID"]] = b["BuildingName"]; });
  unit["BuildingName"] = bldMap[unit["BuildingID"]] || "";

  var cfg   = getConfig();
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  if (!billingMonth) {
    billingMonth = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM");
  }

  var txnId = "PAY-" + tenantId + "-" + Date.now();

  appendSheetRow(getSheet("Ledger"), {
    TxnID:        txnId,
    TenantID:     tenantId,
    UnitID:       tenant["UnitID"],
    BillingMonth: billingMonth,
    TxnType:      "Payment",
    Direction:    "Credit",
    RentAmount:   rentAmount,
    ElecAmount:   elecAmount,
    WaterAmount:  waterAmount,
    TotalAmount:  totalPaid,
    PaymentMode:  paymentMode,
    ReferenceNo:  referenceNo,
    Notes:        notes,
    Date:         today
  });

  var remainingBalance = computeBalance(tenantId);

  try {
    sendReceiptEmail(tenant, unit, billingMonth, {
      rentAmount:  rentAmount,
      elecAmount:  elecAmount,
      waterAmount: waterAmount,
      totalPaid:   totalPaid,
      paymentMode: paymentMode,
      referenceNo: referenceNo
    }, remainingBalance, cfg);
  } catch (emailErr) {
    Logger.log("Email send failed: " + emailErr.message);
  }

  return { txnId: txnId, remainingBalance: remainingBalance };
}

function uploadProof(body) {
  var base64Image = String(body.base64Image || "").trim();
  var fileName    = String(body.fileName    || ("proof-" + Date.now() + ".jpg")).trim();

  if (!base64Image) throw new Error("base64Image is required");

  var decoded = Utilities.base64Decode(base64Image);
  var blob    = Utilities.newBlob(decoded, "image/jpeg", fileName);

  var folders = DriveApp.getFoldersByName("JJ Apartment Proofs");
  var folder  = folders.hasNext() ? folders.next() : DriveApp.createFolder("JJ Apartment Proofs");

  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return { driveUrl: file.getUrl() };
}

function saveReading(body) {
  return { message: "stub: saveReading", unitId: body.unitId };
}

function addTenant(body) {
  var name       = String(body.name       || "").trim();
  var unitId     = String(body.unitId     || "").trim();
  var contact    = String(body.contact    || "").trim();
  var email      = String(body.email      || "").trim();
  var moveInDate = String(body.moveInDate || "").trim();
  var advance    = parseFloat(body.advance) || 0;
  var deposit    = parseFloat(body.deposit) || 0;
  var pin        = String(body.pin        || "").trim();

  if (!name || !unitId || !pin) throw new Error("name, unitId, and pin are required");

  var tenantId = "T-" + Date.now();
  var today    = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  var month    = moveInDate ? moveInDate.substring(0, 7)
               : Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM");

  appendSheetRow(getSheet("Tenants"), {
    TenantID:   tenantId,
    Name:       name,
    UnitID:     unitId,
    Contact:    contact,
    Email:      email,
    MoveInDate: moveInDate,
    Advance:    advance,
    Deposit:    deposit,
    PIN:        pin,
    Status:     "Active"
  });

  if (advance > 0) {
    appendSheetRow(getSheet("Ledger"), {
      TxnID:        generateTxnID(),
      TenantID:     tenantId,
      UnitID:       unitId,
      BillingMonth: month,
      TxnType:      "Credit",
      Direction:    "Credit",
      RentAmount:   advance,
      ElecAmount:   0,
      WaterAmount:  0,
      TotalAmount:  advance,
      Notes:        "Advance",
      Date:         today
    });
  }

  if (deposit > 0) {
    appendSheetRow(getSheet("Ledger"), {
      TxnID:        generateTxnID(),
      TenantID:     tenantId,
      UnitID:       unitId,
      BillingMonth: month,
      TxnType:      "Credit",
      Direction:    "Credit",
      RentAmount:   deposit,
      ElecAmount:   0,
      WaterAmount:  0,
      TotalAmount:  deposit,
      Notes:        "Deposit",
      Date:         today
    });
  }

  var unitsSheet  = getSheet("Units");
  var unitsData   = unitsSheet.getDataRange().getValues();
  var unitHeaders = unitsData[0];
  var unitIdCol   = unitHeaders.indexOf("UnitID");
  var statusCol   = unitHeaders.indexOf("Status");
  for (var i = 1; i < unitsData.length; i++) {
    if (String(unitsData[i][unitIdCol]) === unitId) {
      unitsSheet.getRange(i + 1, statusCol + 1).setValue("Occupied");
      break;
    }
  }

  return { tenantId: tenantId };
}

function moveTenant(body) {
  return { message: "stub: moveTenant", tenantId: body.tenantId };
}

function addExpense(body) {
  return { message: "stub: addExpense", category: body.category };
}

function updateConfig(body) {
  return { message: "stub: updateConfig", key: body.key };
}

// ============================================================
// EMAIL HELPERS
// Config sheet rows required:
//   PropertyName  — e.g. "JJ Apartment"
//   AdminContact  — phone / Messenger shown in footer
//   AdminEmail    — address for admin copy; omit to skip silently
// ============================================================

// tenantEmailForAdmin: pass tenant's email string for admin copy (shows amber banner),
// or null/undefined for the tenant copy (no banner).
function buildReceiptHtml(tenant, unit, billingMonth, payment, remainingBalance, cfg, tenantEmailForAdmin) {
  var propertyName = cfg["PropertyName"] || "JJ Apartment";
  var adminContact = String(cfg["AdminContact"] || "N/A");
  var today        = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

  var unitName    = unit["UnitName"] || unit["UnitID"] || "";
  var unitDisplay = unit["BuildingName"] ? unitName + " &middot; " + unit["BuildingName"] : unitName;

  function ph(n) { return "&#8369;" + Number(n || 0).toFixed(2); }

  var rentStr  = ph(payment.rentAmount);
  var elecStr  = ph(payment.elecAmount);
  var waterStr = ph(payment.waterAmount);
  var totalStr = ph(payment.totalPaid);

  // Reference row — omitted entirely when empty
  var refRow = payment.referenceNo
    ? '<tr>'
        + '<td style="font-size:13px;color:#475569;padding:4px 0 0 0;">Reference No.</td>'
        + '<td style="padding:4px 0 0 0;text-align:right;">'
        + '<span style="font-family:Courier New,Courier,monospace;background-color:#e2e8f0;'
        + 'padding:3px 8px;border-radius:4px;font-size:13px;color:#0f172a;">'
        + payment.referenceNo + '</span></td></tr>'
    : '';

  // Remaining balance — clamp components to 0, never show negative
  var totalBal  = remainingBalance.total  || 0;
  var rentBal   = Math.max(0, remainingBalance.rent  || 0);
  var elecBal   = Math.max(0, remainingBalance.elec  || 0);
  var waterBal  = Math.max(0, remainingBalance.water || 0);

  var balBlock;
  if (totalBal <= 0) {
    balBlock =
      '<table width="100%" cellpadding="0" cellspacing="0" border="0">'
      + '<tr><td align="center" style="background-color:#ecfdf5;border-radius:8px;padding:16px;text-align:center;">'
      + '<span style="font-size:16px;font-weight:bold;color:#10b981;">&#10003; Fully Paid</span>'
      + '</td></tr></table>';
  } else {
    balBlock =
      '<table width="100%" cellpadding="0" cellspacing="0" border="0">'
      + '<tr><td style="background-color:#fef2f2;border-radius:8px;padding:16px;">'
      + '<p style="font-size:11px;color:#991b1b;font-weight:bold;text-transform:uppercase;'
      + 'letter-spacing:0.06em;margin:0 0 10px 0;">Remaining Balance</p>'
      + '<table width="100%" cellpadding="0" cellspacing="0" border="0">'
      + '<tr>'
      + '<td style="font-size:13px;color:#475569;padding:3px 0;">Rent</td>'
      + '<td style="font-size:13px;color:#475569;text-align:right;padding:3px 0;">&#8369;' + rentBal.toFixed(2) + '</td>'
      + '</tr><tr>'
      + '<td style="font-size:13px;color:#475569;padding:3px 0;">Electric</td>'
      + '<td style="font-size:13px;color:#475569;text-align:right;padding:3px 0;">&#8369;' + elecBal.toFixed(2) + '</td>'
      + '</tr><tr>'
      + '<td style="font-size:13px;color:#475569;padding:3px 0;">Water</td>'
      + '<td style="font-size:13px;color:#475569;text-align:right;padding:3px 0;">&#8369;' + waterBal.toFixed(2) + '</td>'
      + '</tr><tr>'
      + '<td colspan="2" style="padding:6px 0 2px;"><div style="height:1px;background-color:#fee2e2;"></div></td>'
      + '</tr><tr>'
      + '<td style="font-size:14px;font-weight:bold;color:#ef4444;padding:4px 0 0;">Total</td>'
      + '<td style="font-size:16px;font-weight:bold;color:#ef4444;text-align:right;padding:4px 0 0;">&#8369;' + totalBal.toFixed(2) + '</td>'
      + '</tr></table>'
      + '</td></tr></table>';
  }

  // Admin amber banner — only for admin copy
  var adminBanner = tenantEmailForAdmin
    ? '<tr><td style="background-color:#fef3c7;border-bottom:1px solid #fde68a;padding:12px 32px;">'
        + '<span style="font-size:12px;color:#78350f;">Admin Copy &#8212; Tenant receipt sent to '
        + tenantEmailForAdmin + '</span>'
        + '</td></tr>'
    : '';

  return '<!DOCTYPE html>'
    + '<html lang="en">'
    + '<head>'
    + '<meta charset="UTF-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta http-equiv="X-UA-Compatible" content="IE=edge">'
    + '</head>'
    + '<body style="margin:0;padding:0;background-color:#f7f8fc;font-family:Arial,Helvetica,sans-serif;">'

    // ── Outer wrapper ────────────────────────────────────────────
    + '<table width="100%" cellpadding="0" cellspacing="0" border="0"'
    + ' style="background-color:#f7f8fc;padding:24px 0;">'
    + '<tr><td align="center" style="padding:0 16px;">'

    // ── Container card ───────────────────────────────────────────
    + '<table width="520" cellpadding="0" cellspacing="0" border="0"'
    + ' style="max-width:520px;width:100%;background-color:#ffffff;'
    + 'border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">'

    // ── Header ───────────────────────────────────────────────────
    + '<tr><td style="background-color:#0f172a;padding:24px 32px;border-radius:12px 12px 0 0;">'
    + '<p style="font-size:20px;font-weight:bold;color:#ffffff;margin:0;line-height:1.3;">' + propertyName + '</p>'
    + '<p style="font-size:13px;color:#8ea3c8;margin:6px 0 0 0;line-height:1.3;">Payment Receipt</p>'
    + '</td></tr>'

    // ── Admin banner (conditional) ───────────────────────────────
    + adminBanner

    // ── Body ─────────────────────────────────────────────────────
    + '<tr><td style="padding:24px 32px;background-color:#ffffff;">'

    // Info grid — 2 rows × 2 cols
    + '<table width="100%" cellpadding="0" cellspacing="0" border="0">'
    + '<tr>'
    + '<td width="50%" style="padding:0 12px 14px 0;vertical-align:top;">'
    + '<p style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 4px 0;">Tenant</p>'
    + '<p style="font-size:14px;color:#0f172a;font-weight:bold;margin:0;">' + (tenant["Name"] || "") + '</p>'
    + '</td>'
    + '<td width="50%" style="padding:0 0 14px 12px;vertical-align:top;text-align:right;">'
    + '<p style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 4px 0;">Unit</p>'
    + '<p style="font-size:14px;color:#0f172a;font-weight:bold;margin:0;">' + unitDisplay + '</p>'
    + '</td>'
    + '</tr><tr>'
    + '<td width="50%" style="padding:0 12px 0 0;vertical-align:top;">'
    + '<p style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 4px 0;">Billing Month</p>'
    + '<p style="font-size:14px;color:#0f172a;font-weight:bold;margin:0;">' + billingMonth + '</p>'
    + '</td>'
    + '<td width="50%" style="padding:0 0 0 12px;vertical-align:top;text-align:right;">'
    + '<p style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 4px 0;">Date Paid</p>'
    + '<p style="font-size:14px;color:#0f172a;font-weight:bold;margin:0;">' + today + '</p>'
    + '</td>'
    + '</tr></table>'

    // HR divider
    + '<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">'

    // ── Payment Summary card ─────────────────────────────────────
    + '<table width="100%" cellpadding="0" cellspacing="0" border="0"'
    + ' style="background-color:#ecfdf5;border-radius:8px;margin-bottom:16px;">'
    + '<tr><td style="padding:16px;">'
    + '<p style="font-size:11px;color:#065f46;font-weight:bold;text-transform:uppercase;'
    + 'letter-spacing:0.06em;margin:0 0 12px 0;">Payment Summary</p>'
    + '<table width="100%" cellpadding="0" cellspacing="0" border="0">'
    + '<tr>'
    + '<td style="font-size:13px;color:#475569;padding:3px 0;">Rent Paid</td>'
    + '<td style="font-size:13px;color:#0f172a;text-align:right;padding:3px 0;">' + rentStr + '</td>'
    + '</tr><tr>'
    + '<td style="font-size:13px;color:#475569;padding:3px 0;">Electric Paid</td>'
    + '<td style="font-size:13px;color:#0f172a;text-align:right;padding:3px 0;">' + elecStr + '</td>'
    + '</tr><tr>'
    + '<td style="font-size:13px;color:#475569;padding:3px 0;">Water Paid</td>'
    + '<td style="font-size:13px;color:#0f172a;text-align:right;padding:3px 0;">' + waterStr + '</td>'
    + '</tr><tr>'
    + '<td style="font-size:14px;font-weight:bold;color:#065f46;'
    + 'border-top:1px solid #a7f3d0;padding-top:10px;padding-bottom:2px;">Total Paid</td>'
    + '<td style="font-size:18px;font-weight:bold;color:#10b981;text-align:right;'
    + 'border-top:1px solid #a7f3d0;padding-top:8px;padding-bottom:2px;">' + totalStr + '</td>'
    + '</tr></table>'
    + '</td></tr></table>'

    // ── Payment Details card ─────────────────────────────────────
    + '<table width="100%" cellpadding="0" cellspacing="0" border="0"'
    + ' style="background-color:#f4f6fb;border-radius:8px;margin-bottom:16px;">'
    + '<tr><td style="padding:16px;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" border="0">'
    + '<tr>'
    + '<td style="font-size:13px;color:#475569;padding:0;">Payment Mode</td>'
    + '<td style="padding:0;text-align:right;">'
    + '<span style="display:inline-block;background-color:#eef2ff;color:#2d5be3;'
    + 'border-radius:999px;padding:3px 12px;font-size:12px;font-weight:bold;">'
    + (payment.paymentMode || "—") + '</span>'
    + '</td></tr>'
    + refRow
    + '</table>'
    + '</td></tr></table>'

    // ── Remaining Balance ────────────────────────────────────────
    + balBlock

    + '</td></tr>'  // end body

    // ── Footer ───────────────────────────────────────────────────
    + '<tr><td style="background-color:#0f172a;padding:16px 32px;border-radius:0 0 12px 12px;">'
    + '<p style="font-size:12px;color:#8ea3c8;margin:0;line-height:1.5;">For inquiries: ' + adminContact + '</p>'
    + '<p style="font-size:11px;color:#3d5280;margin:4px 0 0 0;">JJariel Rentals &middot; JJ Apartment RMS</p>'
    + '</td></tr>'

    + '</table>'           // end container card
    + '</td></tr></table>' // end outer wrapper
    + '</body></html>';
}

function sendReceiptEmail(tenant, unit, billingMonth, payment, remainingBalance, cfg) {
  var tenantEmail = String(tenant["Email"] || "").trim();
  if (!tenantEmail) {
    Logger.log("sendReceiptEmail: skipped — tenant has no email (tenantId=" + tenant["TenantID"] + ")");
    return;
  }

  var adminContact = String(cfg["AdminContact"] || "N/A");
  var adminEmail   = String(cfg["AdminEmail"]   || "").trim();
  var today        = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

  var unitName    = unit["UnitName"] || unit["UnitID"] || "";
  var unitDisplay = unit["BuildingName"] ? unitName + " · " + unit["BuildingName"] : unitName;

  var subject = "Payment Receipt — " + unitDisplay + ", " + billingMonth;

  // Plain-text fallback
  var totalBal = remainingBalance.total || 0;
  var balLine  = totalBal <= 0 ? "Fully Paid" : "₱" + totalBal.toFixed(2) + " remaining";
  var bodyText = [
    (cfg["PropertyName"] || "JJ Apartment") + " — Payment Receipt",
    "",
    "Tenant: "        + (tenant["Name"] || ""),
    "Unit: "          + unitDisplay,
    "Billing Month: " + billingMonth,
    "Date Paid: "     + today,
    "",
    "Rent Paid:     ₱" + (payment.rentAmount  || 0).toFixed(2),
    "Electric Paid: ₱" + (payment.elecAmount  || 0).toFixed(2),
    "Water Paid:    ₱" + (payment.waterAmount || 0).toFixed(2),
    "Total Paid:    ₱" + (payment.totalPaid   || 0).toFixed(2),
    "",
    "Payment Mode:  " + (payment.paymentMode || ""),
    "Reference No:  " + (payment.referenceNo || "N/A"),
    "",
    "Remaining Balance: " + balLine,
    "",
    "For inquiries: " + adminContact
  ].join("\n");

  // 1. Tenant receipt — no admin banner
  var tenantHtml = buildReceiptHtml(tenant, unit, billingMonth, payment, remainingBalance, cfg, null);
  GmailApp.sendEmail(tenantEmail, subject, bodyText, { htmlBody: tenantHtml });
  Logger.log("sendReceiptEmail: receipt sent to tenant=" + tenantEmail);

  // 2. Admin copy — pass tenant email so banner appears; silent skip if AdminEmail unset
  if (adminEmail) {
    var adminHtml    = buildReceiptHtml(tenant, unit, billingMonth, payment, remainingBalance, cfg, tenantEmail);
    var adminSubject = "[ADMIN COPY] " + subject;
    var adminText    = "Admin Copy — Tenant receipt sent to " + tenantEmail + "\n\n" + bodyText;
    GmailApp.sendEmail(adminEmail, adminSubject, adminText, { htmlBody: adminHtml });
    Logger.log("sendReceiptEmail: admin copy sent to=" + adminEmail);
  } else {
    Logger.log("sendReceiptEmail: admin copy skipped — AdminEmail not set in Config sheet");
  }
}

function testDashboard() {
  var result = getDashboardData();
  Logger.log(JSON.stringify(result));
}

// ============================================================
// NOTES HELPERS
// ============================================================

function getOrCreateNotesSheet() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName("Notes");
  if (!sheet) {
    sheet = ss.insertSheet("Notes");
    sheet.appendRow(["Timestamp", "TenantID", "TenantName", "UnitID", "Note"]);
  }
  return sheet;
}

function addNote(body) {
  var tenantId = String(body.tenantId || "").trim();
  var note     = String(body.note     || "").trim();
  if (!tenantId || !note) throw new Error("tenantId and note are required");

  var tenants = sheetToJSON(getSheet("Tenants"));
  var tenant  = tenants.filter(function(t) { return t["TenantID"] === tenantId; })[0];
  if (!tenant) throw new Error("Tenant not found");

  var notesSheet = getOrCreateNotesSheet();
  var ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  appendSheetRow(notesSheet, {
    Timestamp:  ts,
    TenantID:   tenantId,
    TenantName: tenant["Name"] || "",
    UnitID:     tenant["UnitID"] || "",
    Note:       note
  });
  return { timestamp: ts };
}

// ============================================================
// REMINDER HELPERS
// ============================================================

function buildReminderHtml(tenant, unit, unpaidMonths, balance, cfg) {
  var propertyName = cfg["PropertyName"] || "JJ Apartment";
  var adminContact = String(cfg["AdminContact"] || "N/A");
  var unitName    = unit["UnitName"] || unit["UnitID"] || "";
  var unitDisplay = unit["BuildingName"] ? unitName + " &middot; " + unit["BuildingName"] : unitName;
  var tenantName  = tenant["Name"] || "";

  function ph(n) { return "&#8369;" + Number(n || 0).toFixed(2); }

  var monthRows = unpaidMonths.map(function(m) {
    var items = [];
    if (m.rent  > 0) items.push('<tr><td style="font-size:12px;color:#475569;padding:2px 0 0 12px;">Rent</td><td style="font-size:12px;color:#475569;text-align:right;padding:2px 0;">' + ph(m.rent)  + '</td></tr>');
    if (m.elec  > 0) items.push('<tr><td style="font-size:12px;color:#475569;padding:2px 0 0 12px;">Electricity</td><td style="font-size:12px;color:#475569;text-align:right;padding:2px 0;">' + ph(m.elec)  + '</td></tr>');
    if (m.water > 0) items.push('<tr><td style="font-size:12px;color:#475569;padding:2px 0 0 12px;">Water</td><td style="font-size:12px;color:#475569;text-align:right;padding:2px 0;">' + ph(m.water) + '</td></tr>');
    return '<tr><td colspan="2" style="padding:6px 0 2px;"><div style="height:1px;background-color:#fee2e2;"></div></td></tr>'
      + '<tr><td style="font-size:13px;font-weight:bold;color:#0f172a;padding:4px 0 2px;">' + m.month + '</td>'
      + '<td style="font-size:13px;font-weight:bold;color:#ef4444;text-align:right;padding:4px 0 2px;">' + ph(m.total) + '</td></tr>'
      + items.join('');
  }).join('');

  var totalBal = balance.total || 0;

  return '<!DOCTYPE html>'
    + '<html lang="en"><head>'
    + '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta http-equiv="X-UA-Compatible" content="IE=edge">'
    + '</head>'
    + '<body style="margin:0;padding:0;background-color:#f7f8fc;font-family:Arial,Helvetica,sans-serif;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f7f8fc;padding:24px 0;">'
    + '<tr><td align="center" style="padding:0 16px;">'
    + '<table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;background-color:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">'
    + '<tr><td style="background-color:#0f172a;padding:24px 32px;border-radius:12px 12px 0 0;">'
    + '<p style="font-size:20px;font-weight:bold;color:#ffffff;margin:0;line-height:1.3;">' + propertyName + '</p>'
    + '<p style="font-size:13px;color:#8ea3c8;margin:6px 0 0 0;line-height:1.3;">Rental Balance Reminder</p>'
    + '</td></tr>'
    + '<tr><td style="padding:24px 32px;background-color:#ffffff;">'
    + '<p style="font-size:15px;color:#0f172a;margin:0 0 8px 0;">Dear <strong>' + tenantName + '</strong>,</p>'
    + '<p style="font-size:13px;color:#475569;margin:0 0 20px 0;line-height:1.6;">This is a friendly reminder regarding your outstanding rental balance for <strong>' + unitDisplay + '</strong>. Please settle your account at your earliest convenience.</p>'
    + '<table width="100%" cellpadding="0" cellspacing="0" border="0">'
    + '<tr>'
    + '<td width="50%" style="padding:0 12px 14px 0;vertical-align:top;">'
    + '<p style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 4px 0;">Tenant</p>'
    + '<p style="font-size:14px;color:#0f172a;font-weight:bold;margin:0;">' + tenantName + '</p>'
    + '</td>'
    + '<td width="50%" style="padding:0 0 14px 12px;vertical-align:top;text-align:right;">'
    + '<p style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 4px 0;">Unit</p>'
    + '<p style="font-size:14px;color:#0f172a;font-weight:bold;margin:0;">' + unitDisplay + '</p>'
    + '</td>'
    + '</tr></table>'
    + '<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fef2f2;border-radius:8px;margin-bottom:16px;">'
    + '<tr><td style="padding:16px;">'
    + '<p style="font-size:11px;color:#991b1b;font-weight:bold;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px 0;">Outstanding Balance</p>'
    + '<table width="100%" cellpadding="0" cellspacing="0" border="0">'
    + monthRows
    + '<tr><td colspan="2" style="padding:8px 0 2px;"><div style="height:1px;background-color:#fca5a5;"></div></td></tr>'
    + '<tr>'
    + '<td style="font-size:14px;font-weight:bold;color:#ef4444;padding:4px 0 0;">Total</td>'
    + '<td style="font-size:18px;font-weight:bold;color:#ef4444;text-align:right;padding:4px 0 0;">' + ph(totalBal) + '</td>'
    + '</tr></table>'
    + '</td></tr></table>'
    + '<p style="font-size:13px;color:#475569;line-height:1.6;margin:0;">To make a payment or discuss your account, please contact us directly. Kindly include your unit number in any correspondence.</p>'
    + '</td></tr>'
    + '<tr><td style="background-color:#0f172a;padding:16px 32px;border-radius:0 0 12px 12px;">'
    + '<p style="font-size:12px;color:#8ea3c8;margin:0;line-height:1.5;">For inquiries: ' + adminContact + '</p>'
    + '<p style="font-size:11px;color:#3d5280;margin:4px 0 0 0;">JJariel Rentals &middot; JJ Apartment RMS</p>'
    + '</td></tr>'
    + '</table>'
    + '</td></tr></table>'
    + '</body></html>';
}

function sendReminder(body) {
  var tenantId = String(body.tenantId || "").trim();
  if (!tenantId) throw new Error("tenantId is required");

  var tenants = sheetToJSON(getSheet("Tenants"));
  var tenant  = tenants.filter(function(t) { return t["TenantID"] === tenantId; })[0];
  if (!tenant) throw new Error("Tenant not found");

  var tenantEmail = String(tenant["Email"] || "").trim();
  if (!tenantEmail) throw new Error("Tenant has no email address on file");

  var units = sheetToJSON(getSheet("Units"));
  var unit  = units.filter(function(u) { return u["UnitID"] === tenant["UnitID"]; })[0] || {};
  var buildings = sheetToJSON(getSheet("Buildings"));
  var bldMap = {};
  buildings.forEach(function(b) { bldMap[b["BuildingID"]] = b["BuildingName"]; });
  unit["BuildingName"] = bldMap[unit["BuildingID"]] || "";

  var cfg     = getConfig();
  var balance = computeBalance(tenantId);

  var ledger = sheetToJSON(getSheet("Ledger")).filter(function(r) {
    return String(r["TenantID"]) === tenantId;
  });
  var monthMap = {};
  ledger.forEach(function(r) {
    var m = String(r["BillingMonth"] || "").trim().substring(0, 7);
    if (!m) return;
    var isDepositCredit = String(r["Direction"] || "").trim() === "Credit" &&
      String(r["Notes"] || "").toLowerCase().indexOf("deposit") !== -1;
    if (isDepositCredit) return;
    if (!monthMap[m]) monthMap[m] = { rent: 0, elec: 0, water: 0 };
    var sign = String(r["Direction"] || "").trim() === "Debit" ? 1 : -1;
    monthMap[m].rent  += sign * (parseFloat(r["RentAmount"])  || 0);
    monthMap[m].elec  += sign * (parseFloat(r["ElecAmount"])  || 0);
    monthMap[m].water += sign * (parseFloat(r["WaterAmount"]) || 0);
  });
  var unpaidMonths = Object.keys(monthMap)
    .filter(function(m) { var mo = monthMap[m]; return (mo.rent + mo.elec + mo.water) > 0; })
    .sort()
    .map(function(m) {
      var mo = monthMap[m];
      return { month: m, rent: mo.rent, elec: mo.elec, water: mo.water, total: mo.rent + mo.elec + mo.water };
    });

  var unitName    = unit["UnitName"] || unit["UnitID"] || "";
  var unitDisplay = unit["BuildingName"] ? unitName + " · " + unit["BuildingName"] : unitName;
  var subject     = "Rental Reminder — " + (tenant["Name"] || "") + " " + (unit["UnitID"] || "");
  var adminContact = String(cfg["AdminContact"] || "N/A");

  var plainText = "Dear " + (tenant["Name"] || "") + ",\n\n"
    + "This is a friendly reminder regarding your outstanding rental balance.\n\n"
    + "Unit: " + unitDisplay + "\n\n";
  unpaidMonths.forEach(function(m) {
    plainText += m.month + ": ₱" + m.total.toFixed(2) + "\n";
  });
  plainText += "\nTotal Balance: ₱" + (balance.total || 0).toFixed(2)
    + "\n\nPlease coordinate with the admin to settle your balance at your earliest convenience."
    + "\n\nFor inquiries: " + adminContact;

  var html = buildReminderHtml(tenant, unit, unpaidMonths, balance, cfg);
  GmailApp.sendEmail(tenantEmail, subject, plainText, { htmlBody: html });

  var adminEmail = String(cfg["AdminEmail"] || "").trim();
  if (adminEmail) {
    GmailApp.sendEmail(adminEmail, "[ADMIN COPY] " + subject,
      "Admin copy — reminder sent to " + tenantEmail + "\n\n" + plainText,
      { htmlBody: html });
  }

  return { sent: true, to: tenantEmail };
}

// ============================================================
// TENANT UPDATE
// ============================================================

function updateTenant(body) {
  var tenantId = String(body.tenantId || "").trim();
  var name     = String(body.name     || "").trim();
  var contact  = String(body.contact  || "").trim();
  var email    = String(body.email    || "").trim();
  var pin      = String(body.pin      || "").trim();
  var advance  = parseFloat(body.advance);
  var deposit  = parseFloat(body.deposit);

  if (!tenantId) throw new Error("tenantId is required");
  if (!name)     throw new Error("Name is required");
  if (pin && !/^\d{4}$/.test(pin)) throw new Error("PIN must be exactly 4 digits");

  var sheet   = getSheet("Tenants");
  var data    = sheet.getDataRange().getValues();
  var headers = data[0].map(function(h) { return String(h).trim(); });

  var tidCol     = headers.indexOf("TenantID");
  var nameCol    = headers.indexOf("Name");
  var contactCol = headers.indexOf("Contact");
  var emailCol   = headers.indexOf("Email");
  var pinCol     = headers.indexOf("PIN");
  var advanceCol = headers.indexOf("Advance");
  var depositCol = headers.indexOf("Deposit");

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][tidCol]) !== tenantId) continue;
    var rowNum = i + 1;
    sheet.getRange(rowNum, nameCol + 1).setValue(name);
    if (contactCol >= 0) sheet.getRange(rowNum, contactCol + 1).setValue(contact);
    if (emailCol   >= 0) sheet.getRange(rowNum, emailCol   + 1).setValue(email);
    if (pin && pinCol >= 0) sheet.getRange(rowNum, pinCol  + 1).setValue(pin);
    if (advanceCol >= 0 && !isNaN(advance)) sheet.getRange(rowNum, advanceCol + 1).setValue(advance);
    if (depositCol >= 0 && !isNaN(deposit)) sheet.getRange(rowNum, depositCol + 1).setValue(deposit);
    return { tenantId: tenantId, updated: true };
  }

  throw new Error("Tenant not found");
}
